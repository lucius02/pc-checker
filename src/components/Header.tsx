import React, { useEffect, useRef, useState } from "react";
import { Activity, Laptop, PcCase, Clock, RefreshCw, FileDown, ShieldCheck, ShieldAlert, Printer, ChevronDown, Search } from "lucide-react";
import { formatUptime } from "../utils/formatters";
import { cn } from "../utils/cn";
import { useI18nStore, useT, type Lang } from "../i18n";
import { useDiagnosticsStore } from "../store/diagnosticsStore";
import { exportReport } from "../lib/exportReport";
import { useUiStore } from "../store/uiStore";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2";

const ExportMenu: React.FC = () => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2 cursor-pointer";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition-colors cursor-pointer",
          focusRing,
          "focus-visible:outline-cyan-300",
        )}
      >
        <FileDown className="w-3.5 h-3.5" />
        {t("header.export")}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-40">
          <button role="menuitem" className={item} onClick={() => { setOpen(false); void exportReport("html"); }}>
            <FileDown className="w-3.5 h-3.5 text-cyan-400" /> {t("header.exportHtml")}
          </button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); void exportReport("json"); }}>
            <FileDown className="w-3.5 h-3.5 text-slate-400" /> {t("header.exportJson")}
          </button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); window.print(); }}>
            <Printer className="w-3.5 h-3.5 text-slate-400" /> {t("header.print")}
          </button>
        </div>
      )}
    </div>
  );
};

/** `pollingSuspended`: de metingen staan tijdelijk stil omdat er een interactieve test open staat. */
export const Header: React.FC<{ pollingSuspended: boolean }> = ({ pollingSuspended }) => {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const data = useDiagnosticsStore((s) => s.data);
  const powerData = useDiagnosticsStore((s) => s.powerData);
  const autoRefresh = useDiagnosticsStore((s) => s.autoRefresh);
  const setAutoRefresh = useDiagnosticsStore((s) => s.setAutoRefresh);
  const fetchOverview = useDiagnosticsStore((s) => s.fetchOverview);
  const isLoading = useDiagnosticsStore((s) => s.isLoading);
  const elevation = useDiagnosticsStore((s) => s.elevation);
  const restartAsAdmin = useDiagnosticsStore((s) => s.restartAsAdmin);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  const isLive = autoRefresh && !pollingSuspended;

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-4 shrink-0 z-30 print:hidden">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
          <Activity className="w-5 h-5 text-slate-950 font-bold" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold tracking-tight bg-linear-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              PC CHECKER
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-cyan-950/80 border border-cyan-800 text-cyan-400 rounded-full">
              {t("app.badge")}
            </span>
            {powerData && (
              <span className="px-2 py-0.5 text-xs font-medium bg-slate-800 text-slate-300 rounded-full border border-slate-700 flex items-center gap-1">
                {powerData.is_laptop ? (
                  <>
                    <Laptop className="w-3 h-3 text-cyan-400" /> {t("machine.laptop")}
                  </>
                ) : (
                  <>
                    <PcCase className="w-3 h-3 text-cyan-400" /> {t("machine.desktop")}
                  </>
                )}
              </span>
            )}
            {elevation?.is_elevated && (
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-950/60 text-amber-300 rounded-full border border-amber-800 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> {t("header.admin")}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 truncate">{t("app.subtitle")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          title={t("pal.title")}
          aria-label={t("pal.title")}
          className={cn(
            "px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-400 hover:text-slate-200 text-xs flex items-center gap-2 transition-colors cursor-pointer",
            focusRing,
            "focus-visible:outline-cyan-400",
          )}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{t("pal.open")}</span>
          <kbd className="hidden lg:inline px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] font-sans font-medium text-slate-400">
            Ctrl K
          </kbd>
        </button>

        {data && (
          <div className="hidden xl:flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              <strong>{t("header.session")}</strong> {formatUptime(data.session_uptime_secs)}
            </span>
            <span className="text-slate-500">({data.session_started_at})</span>
          </div>
        )}

        {elevation?.can_elevate && (
          <button
            type="button"
            onClick={() => void restartAsAdmin()}
            title={t("header.restartAdminTitle")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-800/80 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 flex items-center gap-1.5 cursor-pointer",
              focusRing,
              "focus-visible:outline-amber-400",
            )}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{t("header.restartAdmin")}</span>
          </button>
        )}

        <label className="sr-only" htmlFor="lang-select">
          {t("header.language")}
        </label>
        <select
          id="lang-select"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className={cn("bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1.5 cursor-pointer", focusRing, "focus-visible:outline-cyan-400")}
        >
          <option value="nl">NL</option>
          <option value="en">EN</option>
        </select>

        <button
          type="button"
          onClick={() => setAutoRefresh(!autoRefresh)}
          aria-pressed={autoRefresh}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer",
            focusRing,
            "focus-visible:outline-emerald-400",
            isLive
              ? "bg-emerald-950/50 border-emerald-800/80 text-emerald-400"
              : autoRefresh
                ? "bg-amber-950/40 border-amber-800/70 text-amber-400"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200",
          )}
          title={isLive ? t("header.autoRefreshTitle") : autoRefresh ? t("header.waitingTitle") : t("header.pausedTitle")}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isLive ? "bg-emerald-400 animate-pulse" : autoRefresh ? "bg-amber-400" : "bg-slate-600",
            )}
          />
          {isLive ? t("header.live") : autoRefresh ? t("header.waiting") : t("header.paused")}
        </button>

        <button
          type="button"
          onClick={() => void fetchOverview()}
          disabled={isLoading}
          className={cn(
            "p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer",
            focusRing,
            "focus-visible:outline-cyan-400",
            isLoading && "opacity-50 cursor-not-allowed",
          )}
          title={t("header.refreshNow")}
          aria-label={t("header.refreshNow")}
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
        </button>

        <ExportMenu />
      </div>
    </header>
  );
};
