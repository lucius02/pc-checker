//! Gedeelde helpers voor het starten van externe processen (PowerShell, cmd, powercfg).
//!
//! Alle aanroepen gaan via [`hidden_command`], zodat er op Windows nooit een
//! knipperend consolevenster verschijnt (`CREATE_NO_WINDOW`). PowerShell-scripts gaan via
//! `-EncodedCommand` (geen quoting-problemen), met UTF-8 uitvoer en een harde time-out.

use std::io::Read;
use std::process::{Command, Stdio};
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

/// Minimale base64-encoder (voor `-EncodedCommand`, geen extra dependency).
pub fn base64_encode(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            T[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            T[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// PowerShell `-EncodedCommand` verwacht base64 van UTF-16LE.
pub fn encode_ps_command(script: &str) -> String {
    let bytes: Vec<u8> = script
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    base64_encode(&bytes)
}

/// Start PowerShell met het script en wacht maximaal `timeout`; daarna wordt het proces gekild.
/// Probeert `powershell` en daarna `powershell.exe` (WSL-interop). `None` als geen van beide start.
pub fn run_powershell(script: &str, timeout: Duration) -> Option<String> {
    let encoded = encode_ps_command(script);
    for exe in ["powershell", "powershell.exe"] {
        let mut cmd = hidden_command(exe);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encoded,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(_) => continue, // probeer de volgende naam
        };
        let mut stdout = child.stdout.take()?;
        let reader = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = stdout.read_to_end(&mut buf);
            String::from_utf8_lossy(&buf).into_owned()
        });
        let started = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if started.elapsed() < timeout => {
                    std::thread::sleep(Duration::from_millis(50))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
            }
        }
        return reader.join().ok();
    }
    None
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
