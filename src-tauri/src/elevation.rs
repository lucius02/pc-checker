//! Beheerdersmodus: detecteert of de app verhoogde rechten heeft en kan zichzelf (alleen op
//! Windows, via UAC) opnieuw starten als administrator. Met verhoogde rechten worden o.a. de
//! SMART-temperatuur/slijtagetellers en de realtime-prioriteit van de latency-test beschikbaar.

use crate::models::ElevationStatus;

#[cfg(windows)]
#[link(name = "shell32")]
unsafe extern "system" {
    fn IsUserAnAdmin() -> i32;
}

pub fn is_elevated() -> bool {
    #[cfg(windows)]
    {
        // SAFETY: IsUserAnAdmin heeft geen argumenten en geen bijwerkingen.
        unsafe { IsUserAnAdmin() != 0 }
    }
    #[cfg(unix)]
    {
        // SAFETY: geteuid kan niet falen.
        unsafe { libc::geteuid() == 0 }
    }
    #[cfg(not(any(windows, unix)))]
    {
        false
    }
}

pub fn elevation_status() -> ElevationStatus {
    let elevated = is_elevated();
    ElevationStatus {
        is_elevated: elevated,
        can_elevate: cfg!(windows) && !elevated,
        platform: std::env::consts::OS.to_string(),
    }
}

/// Escapet een pad voor gebruik binnen een PowerShell-string met enkele quotes.
pub fn ps_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Start dezelfde executable opnieuw met UAC-verhoging. `Ok(true)` = nieuwe instantie gestart
/// (de aanroeper sluit dan deze instantie af), `Ok(false)` = gebruiker heeft UAC geweigerd.
pub fn relaunch_elevated() -> Result<bool, String> {
    if !cfg!(windows) {
        return Err(crate::tr!(
            "Herstarten als beheerder wordt alleen op Windows ondersteund. Start de app met sudo.",
            "Restarting as administrator is only supported on Windows. Start the app with sudo."
        )
        .into());
    }
    let exe = std::env::current_exe().map_err(|e| {
        crate::tr!(
            format!("Kon pad van de app niet bepalen: {e}"),
            format!("Could not determine the app's path: {e}")
        )
    })?;
    let script = format!(
        "try {{ Start-Process -FilePath {} -Verb RunAs -ErrorAction Stop; 'ok' }} catch {{ 'cancel' }}",
        ps_single_quote(&exe.to_string_lossy())
    );
    let out = crate::shell::run_powershell(&script, std::time::Duration::from_secs(120))
        .ok_or_else(|| {
            crate::tr!(
                "PowerShell kon niet worden gestart.",
                "PowerShell could not be started."
            )
            .to_string()
        })?;
    Ok(out.trim() == "ok")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_are_escaped() {
        assert_eq!(
            ps_single_quote(r"C:\Program Files\PC Checker\app.exe"),
            r"'C:\Program Files\PC Checker\app.exe'"
        );
        assert_eq!(ps_single_quote("O'Brien"), "'O''Brien'");
    }

    #[test]
    fn status_is_consistent() {
        let s = elevation_status();
        assert!(!(s.is_elevated && s.can_elevate));
        assert!(!s.platform.is_empty());
    }
}
