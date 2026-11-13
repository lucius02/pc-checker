//! Ruimtegebruik: welke mappen en bestanden nemen de meeste schijfruimte in (een lichte
//! WinDirStat). De mappenboom wordt parallel (rayon) doorlopen. Symlinks en junctions worden
//! niet gevolgd (anders dubbel tellen of eindeloze lussen) en op Unix blijft de scan op
//! hetzelfde bestandssysteem (geen `/proc`, netwerkschijven of andere koppelpunten).
//!
//! Gemeten wordt de ruimte op schijf:
//! - Unix: `st_blocks * 512`, zodat spaarzame bestanden eerlijk tellen; hardlinks één keer.
//! - Windows: de bestandsgrootte, behalve voor cloudbestanden die alleen online staan
//!   (OneDrive "Bestanden op aanvraag"): die nemen lokaal geen ruimte in.

use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, UNIX_EPOCH};

use rayon::prelude::*;

use crate::models::{LargeFile, SpaceEntry, SpaceReport, SpaceScanProgress};

pub const PROGRESS_EVENT: &str = "space-scan-progress";

/// Aantal grootste bestanden in het rapport.
const TOP_FILES: usize = 50;
/// Maximaal aantal submappen per map in het rapport; de rest wordt "overige mappen".
const MAX_CHILDREN: usize = 30;
/// Tot deze diepte worden mappen in het rapport uitgesplitst.
const MAX_DEPTH: usize = 10;
/// Mappen kleiner dan 1/500e (0,2 %) van het totaal worden niet verder uitgesplitst, zodat het
/// rapport klein blijft. Opnieuw scannen vanaf zo'n map geeft alsnog alle details.
const EXPAND_FRACTION: u64 = 500;
const MIN_EXPAND_BYTES: u64 = 1 << 20;
/// Beveiliging tegen extreem diepe (of kunstmatig recursieve) mappenstructuren.
const MAX_WALK_DEPTH: usize = 256;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);

static RUNNING: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

/// Vraagt een lopende analyse om te stoppen; het rapport wordt dan als onvolledig gemarkeerd.
pub fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

struct Node {
    name: String,
    path: PathBuf,
    own_bytes: u64,
    own_files: u64,
    size: u64,
    files: u64,
    dirs: u64,
    denied: bool,
    children: Vec<Node>,
}

type LargeHeap = BinaryHeap<Reverse<(u64, PathBuf, Option<u64>)>>;

struct Ctx<'a> {
    cancel: &'a AtomicBool,
    files: AtomicU64,
    dirs: AtomicU64,
    bytes: AtomicU64,
    skipped: AtomicU64,
    current: Mutex<String>,
    largest: Mutex<LargeHeap>,
    /// Kleinste grootte die nog in de top past; voorkomt een lock per bestand.
    large_min: AtomicU64,
    #[cfg(unix)]
    root_dev: Option<u64>,
    #[cfg(unix)]
    seen_links: Mutex<std::collections::HashSet<(u64, u64)>>,
}

impl<'a> Ctx<'a> {
    fn new(root: &Path, cancel: &'a AtomicBool) -> Self {
        #[cfg(not(unix))]
        let _ = root;
        Ctx {
            cancel,
            files: AtomicU64::new(0),
            dirs: AtomicU64::new(0),
            bytes: AtomicU64::new(0),
            skipped: AtomicU64::new(0),
            current: Mutex::new(String::new()),
            largest: Mutex::new(BinaryHeap::with_capacity(TOP_FILES + 1)),
            large_min: AtomicU64::new(0),
            #[cfg(unix)]
            root_dev: {
                use std::os::unix::fs::MetadataExt;
                fs::metadata(root).ok().map(|m| m.dev())
            },
            #[cfg(unix)]
            seen_links: Mutex::new(std::collections::HashSet::new()),
        }
    }

    fn progress(&self) -> SpaceScanProgress {
        SpaceScanProgress {
            files: self.files.load(Ordering::Relaxed),
            dirs: self.dirs.load(Ordering::Relaxed),
            bytes: self.bytes.load(Ordering::Relaxed),
            current: self.current.lock().map(|c| c.clone()).unwrap_or_default(),
        }
    }

    fn offer_large(&self, size: u64, path: impl FnOnce() -> PathBuf, modified: Option<u64>) {
        if size == 0 || size < self.large_min.load(Ordering::Relaxed) {
            return;
        }
        let Ok(mut heap) = self.largest.lock() else {
            return;
        };
        heap.push(Reverse((size, path(), modified)));
        if heap.len() > TOP_FILES {
            heap.pop();
        }
        if heap.len() == TOP_FILES
            && let Some(Reverse((min, _, _))) = heap.peek()
        {
            self.large_min.store(*min, Ordering::Relaxed);
        }
    }

    /// Ruimte die een bestand werkelijk op de schijf inneemt.
    fn disk_size(&self, md: &fs::Metadata) -> u64 {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if md.nlink() > 1
                && let Ok(mut seen) = self.seen_links.lock()
                && !seen.insert((md.dev(), md.ino()))
            {
                return 0;
            }
            md.blocks() * 512
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            // FILE_ATTRIBUTE_OFFLINE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS: alleen online.
            const CLOUD_ONLY: u32 = 0x0000_1000 | 0x0004_0000 | 0x0040_0000;
            if md.file_attributes() & CLOUD_ONLY != 0 {
                0
            } else {
                md.len()
            }
        }
        #[cfg(not(any(unix, windows)))]
        {
            md.len()
        }
    }

    /// Andere schijf/partitie gekoppeld binnen de gescande map (alleen Unix).
    #[cfg(unix)]
    fn other_filesystem(&self, entry: &fs::DirEntry) -> bool {
        use std::os::unix::fs::MetadataExt;
        match (self.root_dev, entry.metadata()) {
            (Some(root), Ok(md)) => md.dev() != root,
            _ => false,
        }
    }
}

fn epoch_ms(md: &fs::Metadata) -> Option<u64> {
    md.modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

fn walk(ctx: &Ctx, path: PathBuf, name: String, depth: usize) -> Node {
    let mut node = Node {
        name,
        path,
        own_bytes: 0,
        own_files: 0,
        size: 0,
        files: 0,
        dirs: 0,
        denied: false,
        children: Vec::new(),
    };
    if ctx.cancel.load(Ordering::Relaxed) || depth > MAX_WALK_DEPTH {
        return node;
    }
    let entries = match fs::read_dir(&node.path) {
        Ok(rd) => rd,
        Err(_) => {
            ctx.skipped.fetch_add(1, Ordering::Relaxed);
            node.denied = true;
            return node;
        }
    };
    if ctx.dirs.fetch_add(1, Ordering::Relaxed).is_multiple_of(64)
        && let Ok(mut cur) = ctx.current.try_lock()
    {
        *cur = node.path.display().to_string();
    }

    let mut subdirs: Vec<(PathBuf, String)> = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else {
            node.denied = true;
            continue;
        };
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            #[cfg(unix)]
            if ctx.other_filesystem(&entry) {
                continue;
            }
            subdirs.push((
                entry.path(),
                entry.file_name().to_string_lossy().into_owned(),
            ));
        } else if ft.is_file() {
            let Ok(md) = entry.metadata() else {
                continue;
            };
            let size = ctx.disk_size(&md);
            node.own_bytes += size;
            node.own_files += 1;
            ctx.files.fetch_add(1, Ordering::Relaxed);
            ctx.bytes.fetch_add(size, Ordering::Relaxed);
            ctx.offer_large(size, || entry.path(), epoch_ms(&md));
        }
    }

    node.children = subdirs
        .into_par_iter()
        .map(|(p, n)| walk(ctx, p, n, depth + 1))
        .collect();
    node.size = node.own_bytes + node.children.iter().map(|c| c.size).sum::<u64>();
    node.files = node.own_files + node.children.iter().map(|c| c.files).sum::<u64>();
    node.dirs = node.children.len() as u64 + node.children.iter().map(|c| c.dirs).sum::<u64>();
    node
}

/// Zet de volledige boom om in een compact rapport: alleen grote mappen worden uitgesplitst.
fn to_entry(node: Node, depth: usize, threshold: u64) -> SpaceEntry {
    let mut children = node.children;
    children.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
    let expand = depth == 0 || (depth < MAX_DEPTH && node.size >= threshold);
    let keep = if expand {
        children.len().min(MAX_CHILDREN)
    } else {
        0
    };
    let rest = children.split_off(keep);
    SpaceEntry {
        name: node.name,
        path: node.path.display().to_string(),
        size_bytes: node.size,
        file_count: node.files,
        dir_count: node.dirs,
        own_files_bytes: node.own_bytes,
        own_file_count: node.own_files,
        other_bytes: rest.iter().map(|c| c.size).sum(),
        other_count: rest.len() as u64,
        children: children
            .into_iter()
            .map(|c| to_entry(c, depth + 1, threshold))
            .collect(),
        access_denied: node.denied,
    }
}

/// Staat `path` op het volume met koppelpunt `mount`? Windows: hoofdletterongevoelig.
pub fn path_on_mount(path: &str, mount: &str) -> bool {
    let norm = |s: &str| {
        let s = if cfg!(windows) {
            s.replace('/', "\\").to_lowercase()
        } else {
            s.to_string()
        };
        s.trim_end_matches(['/', '\\']).to_string()
    };
    let (p, m) = (norm(path), norm(mount));
    let sep = if cfg!(windows) { '\\' } else { '/' };
    m.is_empty() || p == m || p.starts_with(&format!("{m}{sep}"))
}

/// Koppelpunt, totale en vrije ruimte van het volume waarop `path` staat.
fn find_volume(path: &str) -> Option<(String, u64, u64)> {
    let disks = sysinfo::Disks::new_with_refreshed_list().ok()?;
    disks
        .iter()
        .map(|d| (d.mount_point().display().to_string(), d))
        .filter(|(m, _)| path_on_mount(path, m))
        .max_by_key(|(m, _)| m.len())
        .map(|(m, d)| (m, d.total_space(), d.available_space()))
}

/// Analyseert `root`. `on_progress` wordt periodiek aangeroepen vanaf een aparte thread.
pub fn scan<F>(root: &Path, cancel: &AtomicBool, mut on_progress: F) -> SpaceReport
where
    F: FnMut(SpaceScanProgress) + Send,
{
    let started = Instant::now();
    let scanned_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let ctx = Ctx::new(root, cancel);
    let done = AtomicBool::new(false);
    let root_name = root.display().to_string();

    let node = std::thread::scope(|s| {
        let (ctx_ref, done_ref) = (&ctx, &done);
        s.spawn(move || {
            let step = Duration::from_millis(50);
            let mut waited = Duration::ZERO;
            while !done_ref.load(Ordering::Relaxed) {
                std::thread::sleep(step);
                waited += step;
                if waited >= PROGRESS_INTERVAL {
                    waited = Duration::ZERO;
                    on_progress(ctx_ref.progress());
                }
            }
        });
        let node = walk(&ctx, root.to_path_buf(), root_name, 0);
        done.store(true, Ordering::Relaxed);
        node
    });

    let threshold = (node.size / EXPAND_FRACTION).max(MIN_EXPAND_BYTES);
    let root_entry = to_entry(node, 0, threshold);
    let largest_files = ctx
        .largest
        .into_inner()
        .unwrap_or_default()
        .into_sorted_vec()
        .into_iter()
        .map(|Reverse((size, path, modified))| LargeFile {
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: path.display().to_string(),
            size_bytes: size,
            modified_epoch_ms: modified,
        })
        .collect();
    let volume = find_volume(&root_entry.path);

    SpaceReport {
        root: root_entry,
        scanned_at,
        duration_ms: started.elapsed().as_millis() as u64,
        largest_files,
        skipped_dirs: ctx.skipped.load(Ordering::Relaxed),
        cancelled: cancel.load(Ordering::Relaxed),
        is_elevated: crate::elevation::is_elevated(),
        volume_mount: volume.as_ref().map(|v| v.0.clone()),
        volume_total_bytes: volume.as_ref().map(|v| v.1),
        volume_available_bytes: volume.as_ref().map(|v| v.2),
    }
}

/// Ingang voor het Tauri-commando: controleert de map en laat maar één analyse tegelijk toe.
pub fn analyze<F>(path: &str, on_progress: F) -> Result<SpaceReport, String>
where
    F: FnMut(SpaceScanProgress) + Send,
{
    let root = PathBuf::from(path.trim());
    if path.trim().is_empty() || !root.is_dir() {
        return Err(crate::tr!(
            format!("Map niet gevonden: {}", path),
            format!("Folder not found: {}", path)
        ));
    }
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err(crate::tr!(
            "Er loopt al een ruimte-analyse.",
            "A space analysis is already running."
        )
        .to_string());
    }
    struct Running;
    impl Drop for Running {
        fn drop(&mut self) {
            RUNNING.store(false, Ordering::SeqCst);
        }
    }
    let _running = Running;
    CANCEL.store(false, Ordering::SeqCst);
    Ok(scan(&root, &CANCEL, on_progress))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let p = std::env::temp_dir().join(format!(
                "pc-checker-space-{}-{}-{}",
                tag,
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            TempDir(p)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write(path: &Path, len: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let data: Vec<u8> = (0..len).map(|i| (i % 251) as u8 + 1).collect();
        fs::write(path, data).unwrap();
    }

    #[test]
    fn sizes_sorting_and_largest_files() {
        let t = TempDir::new("tree");
        write(&t.0.join("big/a.bin"), 400_000);
        write(&t.0.join("big/nested/b.bin"), 300_000);
        write(&t.0.join("small/c.txt"), 20_000);
        write(&t.0.join("root.txt"), 50_000);
        fs::create_dir_all(t.0.join("empty")).unwrap();

        let r = scan(&t.0, &AtomicBool::new(false), |_| {});
        assert!(!r.cancelled);
        assert_eq!(r.root.file_count, 4);
        assert_eq!(r.root.dir_count, 4); // big, big/nested, small, empty
        assert_eq!(r.root.own_file_count, 1);
        let names: Vec<_> = r.root.children.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["big", "small", "empty"]);
        let big = &r.root.children[0];
        assert!(big.size_bytes >= 700_000);
        assert_eq!(big.file_count, 2);
        assert_eq!(
            r.root.size_bytes,
            r.root.own_files_bytes + r.root.children.iter().map(|c| c.size_bytes).sum::<u64>()
        );
        let files: Vec<_> = r.largest_files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(files, ["a.bin", "b.bin", "root.txt", "c.txt"]);
        assert!(r.largest_files[0].modified_epoch_ms.is_some());
    }

    #[test]
    fn cancelled_scan_is_flagged_and_empty() {
        let t = TempDir::new("cancel");
        write(&t.0.join("x/y.bin"), 1000);
        let r = scan(&t.0, &AtomicBool::new(true), |_| {});
        assert!(r.cancelled);
        assert_eq!(r.root.file_count, 0);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_and_hardlinks_are_not_double_counted() {
        let t = TempDir::new("links");
        write(&t.0.join("real/data.bin"), 200_000);
        std::os::unix::fs::symlink(t.0.join("real"), t.0.join("link")).unwrap();
        fs::hard_link(t.0.join("real/data.bin"), t.0.join("real/copy.bin")).unwrap();
        let r = scan(&t.0, &AtomicBool::new(false), |_| {});
        assert_eq!(r.root.children.len(), 1, "symlinked folder must be skipped");
        assert_eq!(r.root.file_count, 2);
        let real = &r.root.children[0];
        assert!(
            real.size_bytes < 400_000,
            "hardlink counted twice: {}",
            real.size_bytes
        );
    }

    #[test]
    fn small_folders_are_folded_into_other() {
        let t = TempDir::new("prune");
        for i in 0..(MAX_CHILDREN + 5) {
            write(&t.0.join(format!("d{i:02}/f.bin")), 1000 + i * 10);
        }
        let r = scan(&t.0, &AtomicBool::new(false), |_| {});
        assert_eq!(r.root.children.len(), MAX_CHILDREN);
        assert_eq!(r.root.other_count, 5);
        // Onder de uitsplitsdrempel: geen kleinkinderen in het rapport.
        assert!(r.root.children.iter().all(|c| c.children.is_empty()));
    }

    #[test]
    fn mount_matching() {
        assert!(path_on_mount("/home/user", "/"));
        assert!(path_on_mount("/home/user", "/home"));
        assert!(path_on_mount("/home", "/home/"));
        assert!(!path_on_mount("/homework", "/home"));
        if cfg!(windows) {
            assert!(path_on_mount("c:\\Users", "C:\\"));
            assert!(path_on_mount("D:/Games", "D:\\"));
            assert!(!path_on_mount("D:\\Games", "C:\\"));
        }
    }

    #[test]
    fn analyze_rejects_missing_folder() {
        assert!(analyze("/definitely/not/here/pc-checker", |_| {}).is_err());
        assert!(analyze("  ", |_| {}).is_err());
    }
}
