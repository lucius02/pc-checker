//! Taalkeuze voor teksten die de backend teruggeeft (samenvattingen, adviezen, details).
//!
//! De frontend roept bij het opstarten en bij elke taalwissel `set_language` aan. Teksten
//! worden gekozen met de [`tr!`](crate::tr) macro: `tr!("Nederlands", "English")`. Alleen de
//! gekozen tak wordt geëvalueerd, dus `tr!(format!(..), format!(..))` kost niets extra.
//!
//! **Statuscodes blijven Nederlands** (`"Goed"`, `"Let op"`, `"Kritiek"`, `"Hoog"`, `"Verouderd"`,
//! …): de frontend vergelijkt daarop en vertaalt ze zelf voor weergave. Zo breekt een taalwissel
//! nooit logica.

use std::cell::Cell;
use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

thread_local! {
    /// Alleen voor tests: per thread een taal forceren zonder andere (parallelle) tests te raken.
    static OVERRIDE: Cell<Option<bool>> = const { Cell::new(None) };
}

/// Stelt de taal in ("nl" of "en"; al het andere valt terug op Nederlands).
pub fn set_language(code: &str) {
    ENGLISH.store(code.eq_ignore_ascii_case("en"), Ordering::Relaxed);
}

pub fn is_english() -> bool {
    OVERRIDE
        .with(|o| o.get())
        .unwrap_or_else(|| ENGLISH.load(Ordering::Relaxed))
}

pub fn current_language() -> &'static str {
    if is_english() { "en" } else { "nl" }
}

/// Voert `f` uit met een geforceerde taal op de huidige thread (voor tests).
pub fn with_language<T>(english: bool, f: impl FnOnce() -> T) -> T {
    let prev = OVERRIDE.with(|o| o.replace(Some(english)));
    let out = f();
    OVERRIDE.with(|o| o.set(prev));
    out
}

/// Kiest de Nederlandse of Engelse variant. Beide takken moeten hetzelfde type hebben.
#[macro_export]
macro_rules! tr {
    ($nl:expr, $en:expr $(,)?) => {
        if $crate::i18n::is_english() { $en } else { $nl }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_is_thread_local_and_restored() {
        assert_eq!(with_language(true, || tr!("nl", "en")), "en");
        assert_eq!(with_language(false, || tr!("nl", "en")), "nl");
        // Na de closure geldt weer de globale instelling.
        assert_eq!(is_english(), ENGLISH.load(Ordering::Relaxed));
    }

    #[test]
    fn only_selected_branch_is_evaluated() {
        let mut calls = 0;
        let _ = with_language(true, || {
            tr!(
                {
                    calls += 1;
                    "nl"
                },
                "en"
            )
        });
        assert_eq!(calls, 0);
    }
}
