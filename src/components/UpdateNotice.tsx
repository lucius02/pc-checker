import React, { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, X, Loader2, Sparkles } from "lucide-react";
import { useT } from "../i18n";
import { toast } from "../store/toastStore";
import { errorMessage } from "../lib/api";

const DISMISS_KEY = "pcc.update.dismissed";

const readDismissed = (): string | null => {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
};

/**
 * Controleert bij het opstarten of er een nieuwere (gepubliceerde) release is. Zo ja: een balk met
 * "Installeren en herstarten". De updater-plugin accepteert alleen updates die met onze
 * privésleutel zijn getekend; een vervalste download wordt geweigerd.
 */
export const UpdateNotice: React.FC = () => {
  const t = useT();
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    // Alleen in de echte app (niet in de browser) en niet tijdens `tauri dev`.
    if (import.meta.env.DEV || !("__TAURI_INTERNALS__" in window)) return;
    let cancelled = false;
    check()
      .then((u) => {
        if (!cancelled && u && readDismissed() !== u.version) setUpdate(u);
      })
      .catch((err) => {
        // Geen internet, of nog geen release met latest.json: stil overslaan.
        console.warn("Update check failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  const install = async () => {
    let total = 0;
    let done = 0;
    setProgress(0);
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          done += ev.data.chunkLength;
          if (total > 0) setProgress(Math.min(100, Math.round((done / total) * 100)));
        } else if (ev.event === "Finished") setProgress(100);
      });
      // Op Windows sluit het installatieprogramma de app zelf af; elders herstarten we hier.
      await relaunch();
    } catch (err) {
      setProgress(null);
      toast.error(t("update.failed"), errorMessage(err));
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, update.version);
    } catch {
      /* niet erg: dan verschijnt hij bij de volgende start opnieuw */
    }
    setUpdate(null);
  };

  const busy = progress !== null;
  return (
    <div
      role="status"
      className="max-w-7xl w-full mx-auto px-6 pt-4"
    >
      <div className="p-4 rounded-2xl border border-cyan-800 bg-cyan-950/60 flex flex-col sm:flex-row sm:items-center gap-3">
        <Sparkles className="w-5 h-5 text-cyan-300 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-100">
            {t("update.available", { v: update.version, c: update.currentVersion })}
          </div>
          {update.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2 whitespace-pre-line">{update.body}</p>}
          {busy && (
            <div className="mt-2 h-1.5 w-full max-w-sm rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void install()}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {busy ? t("update.installing", { p: progress ?? 0 }) : t("update.install")}
          </button>
          {!busy && (
            <button
              type="button"
              onClick={dismiss}
              title={t("update.later")}
              aria-label={t("update.later")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
