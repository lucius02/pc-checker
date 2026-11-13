use std::time::Duration;

pub use crate::shell::run_powershell;

/// Performance-counter-index (Perflib) → Engelse naam.
pub const COUNTER_IDS: [(&str, u32, &str); 4] = [
    ("obj", 238, "Processor"),
    ("dpc", 696, "% DPC Time"),
    ("irq", 698, "% Interrupt Time"),
    ("dpcq", 1334, "DPCs Queued/sec"),
];

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CounterStats {
    pub dpc_avg: Option<f64>,
    pub dpc_max: Option<f64>,
    pub irq_avg: Option<f64>,
    pub irq_max: Option<f64>,
    pub dpcq_avg: Option<f64>,
    /// "registry" (gelokaliseerde namen via index) of "en" (Engelse terugval)
    pub name_source: Option<String>,
}

impl CounterStats {
    pub fn any(&self) -> bool {
        self.dpc_avg.is_some() || self.irq_avg.is_some() || self.dpcq_avg.is_some()
    }
}

pub fn counter_script(samples: u64) -> String {
    let mut ids = String::new();
    let mut en = String::new();
    for (i, (key, idx, name)) in COUNTER_IDS.iter().enumerate() {
        if i > 0 {
            ids.push_str("; ");
            en.push_str("; ");
        }
        ids.push_str(&format!("{} = {}", key, idx));
        en.push_str(&format!("{} = '{}'", key, name.replace('\'', "''")));
    }
    format!(
        r#"$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
$ids = [ordered]@{{ {ids} }}
$names = @{{ {en} }}
$src = 'en'
try {{
  $loc = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Perflib\CurrentLanguage' -Name Counter -ErrorAction Stop).Counter
  $map = @{{}}
  for ($i = 0; $i -lt $loc.Count - 1; $i += 2) {{ $map[[string]$loc[$i]] = $loc[$i + 1] }}
  $ok = $true
  foreach ($k in $ids.Keys) {{ if (-not $map.ContainsKey([string]$ids[$k])) {{ $ok = $false }} }}
  if ($ok) {{ foreach ($k in $ids.Keys) {{ $names[$k] = $map[[string]$ids[$k]] }}; $src = 'registry' }}
}} catch {{}}
$keys = @('dpc', 'irq', 'dpcq')
$paths = $keys | ForEach-Object {{ '\' + $names['obj'] + '(_Total)\' + $names[$_] }}
$out = New-Object System.Collections.ArrayList
Get-Counter -Counter $paths -SampleInterval 1 -MaxSamples {samples} -ErrorAction SilentlyContinue | ForEach-Object {{
  foreach ($s in $_.CounterSamples) {{
    $p = $s.Path.ToLowerInvariant()
    foreach ($k in $keys) {{
      if ($p.EndsWith('\' + $names[$k].ToLowerInvariant())) {{ [void]$out.Add([pscustomobject]@{{ k = $k; v = [double]$s.CookedValue }}) }}
    }}
  }}
}}
[pscustomobject]@{{ source = $src; samples = @($out) }} | ConvertTo-Json -Compress -Depth 4
"#
    )
}

pub fn avg_max(values: &[f64]) -> (Option<f64>, Option<f64>) {
    if values.is_empty() {
        return (None, None);
    }
    let avg = values.iter().sum::<f64>() / values.len() as f64;
    let max = values.iter().cloned().fold(f64::MIN, f64::max);
    (Some(avg), Some(max))
}

/// Parseert de JSON-uitvoer van `counter_script`. Robuust voor object-vs-array
/// (PS 5.1 pakt arrays met één element soms uit), lege of ongeldige uitvoer.
pub fn parse_counter_json(raw: &str) -> CounterStats {
    let trimmed = raw.trim().trim_start_matches('\u{feff}');
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return CounterStats::default();
    };
    let samples: Vec<serde_json::Value> = match parsed.get("samples") {
        Some(serde_json::Value::Array(a)) => a.clone(),
        Some(v @ serde_json::Value::Object(_)) => vec![v.clone()],
        _ => Vec::new(),
    };
    let mut dpc = Vec::new();
    let mut irq = Vec::new();
    let mut dpcq = Vec::new();
    for s in &samples {
        let (Some(k), Some(v)) = (
            s.get("k").and_then(|k| k.as_str()),
            s.get("v").and_then(|v| v.as_f64()),
        ) else {
            continue;
        };
        if !v.is_finite() {
            continue;
        }
        match k {
            "dpc" => dpc.push(v),
            "irq" => irq.push(v),
            "dpcq" => dpcq.push(v),
            _ => {}
        }
    }
    let (dpc_avg, dpc_max) = avg_max(&dpc);
    let (irq_avg, irq_max) = avg_max(&irq);
    let (dpcq_avg, _) = avg_max(&dpcq);
    CounterStats {
        dpc_avg,
        dpc_max,
        irq_avg,
        irq_max,
        dpcq_avg,
        name_source: parsed
            .get("source")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string()),
    }
}

pub fn collect_counters(duration_secs: u64) -> CounterStats {
    let script = counter_script(duration_secs.max(1));
    let timeout = Duration::from_secs(duration_secs + 20);
    match run_powershell(&script, timeout) {
        Some(out) => parse_counter_json(&out),
        None => CounterStats::default(),
    }
}
