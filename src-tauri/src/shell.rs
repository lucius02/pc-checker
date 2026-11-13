//! Gedeelde helpers voor het starten van externe processen (PowerShell, cmd, powercfg).
//!
//! Alle aanroepen gaan via [`hidden_command`], zodat er op Windows nooit een
//! knipperend consolevenster verschijnt (`CREATE_NO_WINDOW`). PowerShell-scripts gaan via
//! stdin (geen quoting-problemen), met UTF-8 in- en uitvoer en een harde time-out.
//!
//! Bewust géén `-EncodedCommand` en géén `-ExecutionPolicy Bypass`: dat is het klassieke patroon
//! van malware die zijn opdrachten verbergt, en virusscanners (o.a. Bitdefender) sluiten de app
//! dan af. De uitvoeringsbeleid-instelling geldt alleen voor scriptbestanden, niet voor tekst die
//! we zelf aanleveren, dus Bypass was ook nooit nodig.

use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;
use serde_json::Value;

/// Standaard time-out voor WMI/eventlog-scripts.
pub const DEFAULT_PS_TIMEOUT: Duration = Duration::from_secs(30);

/// Windows `CREATE_NO_WINDOW` process creation flag.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Maakt een `Command` dat op Windows geen consolevenster opent.
pub fn hidden_command(exe: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(exe);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Leest het volledige script als UTF-8 van stdin en voert het als één geheel uit. (`-Command -`
/// leest regel voor regel, zoals een interactieve console, en breekt dan op bijv. `if` / `else`
/// op aparte regels.)
const PS_STDIN_LOADER: &str = "[Console]::InputEncoding=[Text.Encoding]::UTF8; & ([scriptblock]::Create([Console]::In.ReadToEnd()))";

/// Start PowerShell met het script en wacht maximaal `timeout`; daarna wordt het proces gekild.
/// Probeert `powershell` en daarna `powershell.exe` (WSL-interop). `None` als geen van beide start.
pub fn run_powershell(script: &str, timeout: Duration) -> Option<String> {
    for exe in ["powershell", "powershell.exe"] {
        let mut cmd = hidden_command(exe);
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", PS_STDIN_LOADER])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(_) => continue, // probeer de volgende naam
        };
        // Script wegschrijven en stdin sluiten (= einde invoer). In een aparte thread, zodat een
        // groot script niet vastloopt als PowerShell tegelijk uitvoer schrijft.
        if let Some(mut stdin) = child.stdin.take() {
            let bytes = script.as_bytes().to_vec();
            std::thread::spawn(move || {
                let _ = stdin.write_all(&bytes);
            });
        }
        return wait_for_output(child, timeout).map(|(output, _)| output);
    }
    None
}

/// Start een programma (zonder shell) en geeft stdout terug, of `None` als het niet start of
/// niet succesvol eindigt. Na `timeout` wordt het proces gekild.
pub fn run_command(exe: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let child = hidden_command(exe)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let (output, success) = wait_for_output(child, timeout)?;
    success.then_some(output)
}

/// Leest stdout van `child` in een aparte thread (zodat een volle pipe het proces niet
/// blokkeert) en wacht maximaal `timeout`. Geeft de uitvoer terug plus of het proces
/// succesvol (exitcode 0, geen time-out) eindigde.
fn wait_for_output(mut child: Child, timeout: Duration) -> Option<(String, bool)> {
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        String::from_utf8_lossy(&buf).into_owned()
    });
    let started = Instant::now();
    let success = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status.success(),
            Ok(None) if started.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(50))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break false;
            }
        }
    };
    Some((reader.join().ok()?, success))
}

/// Voert een script uit met UTF-8 uitvoer en de standaard time-out.
pub fn run_ps(script: &str) -> Option<String> {
    let full = format!(
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='SilentlyContinue'; {}",
        script
    );
    run_powershell(&full, DEFAULT_PS_TIMEOUT)
}

/// Parseert PowerShell JSON-uitvoer (inclusief BOM/witruimte). `None` bij lege/ongeldige uitvoer.
pub fn parse_ps_json(raw: &str) -> Option<Value> {
    let trimmed = raw.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str(trimmed).ok()
}

/// Voert een script uit dat JSON print en geeft de geparste waarde terug.
pub fn run_ps_json(script: &str) -> Option<Value> {
    run_ps(script).and_then(|raw| parse_ps_json(&raw))
}

/// PowerShell 5.1 pakt arrays met één element uit tot een object; dit normaliseert
/// `null` / object / array naar een `Vec`.
pub fn json_items(value: &Value) -> Vec<Value> {
    match value {
        Value::Array(a) => a.clone(),
        Value::Object(_) => vec![value.clone()],
        _ => Vec::new(),
    }
}

/// Getypeerde variant van [`json_items`]: items die niet deserialiseren worden overgeslagen.
pub fn typed_items<T: DeserializeOwned>(value: &Value) -> Vec<T> {
    json_items(value)
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .collect()
}

/// Leest een niet-lege, getrimde string uit een JSON-object.
pub fn str_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Het script gaat via stdin; meerregelige blokken, `if`/`else` op aparte regels, lege regels
    /// en niet-ASCII-tekens moeten heel blijven.
    #[cfg(windows)]
    #[test]
    fn run_ps_reads_whole_script_from_stdin() {
        let script = "$x = 1

if ($x -eq 2) {
  'two'
}
else {
  'not two'
}
$h = @{
  a = 1

  b = 2
}
\"$($h.b) héllo ✓\"
";
        let out = run_ps(script).expect("PowerShell should start");
        let lines: Vec<&str> = out.lines().map(str::trim).collect();
        assert_eq!(lines, ["not two", "2 héllo ✓"]);
    }

    #[test]
    fn json_items_normalizes_shapes() {
        assert!(json_items(&Value::Null).is_empty());
        assert_eq!(json_items(&serde_json::json!({"a": 1})).len(), 1);
        assert_eq!(
            json_items(&serde_json::json!([{"a": 1}, {"a": 2}])).len(),
            2
        );
    }

    #[test]
    fn parse_ps_json_handles_bom_and_empty() {
        assert!(parse_ps_json("").is_none());
        assert!(parse_ps_json("  \r\n").is_none());
        assert!(parse_ps_json("garbage").is_none());
        assert_eq!(parse_ps_json("\u{feff}{\"x\":1}").unwrap()["x"], 1);
    }

    #[test]
    fn typed_items_skips_invalid() {
        #[derive(serde::Deserialize)]
        struct Item {
            #[serde(rename = "Name")]
            name: String,
        }
        let v = serde_json::json!([{"Name": "a"}, {"Other": 1}, {"Name": "b"}]);
        let items: Vec<Item> = typed_items(&v);
        assert_eq!(
            items.iter().map(|i| i.name.as_str()).collect::<Vec<_>>(),
            ["a", "b"]
        );
    }

    #[test]
    fn str_field_trims_and_filters_empty() {
        let v = serde_json::json!({"a": "  x ", "b": "   ", "c": 3});
        assert_eq!(str_field(&v, "a").as_deref(), Some("x"));
        assert_eq!(str_field(&v, "b"), None);
        assert_eq!(str_field(&v, "c"), None);
        assert_eq!(str_field(&v, "missing"), None);
    }
}
