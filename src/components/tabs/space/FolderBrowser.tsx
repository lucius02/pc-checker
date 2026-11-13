import React from "react";
import { ChevronRight, CornerLeftUp, FileText, Folder, FolderOpen, FolderSearch, Layers, ShieldAlert } from "lucide-react";
import type { SpaceEntry } from "../../../types";
import { useI18nStore, useT } from "../../../i18n";
import { formatBytes } from "../../../utils/formatters";
import { cn } from "../../../utils/cn";
import { folderRows, resolveTrail } from "../../../lib/spaceTree";

interface FolderBrowserProps {
  root: SpaceEntry;
  trail: string[];
  setTrail: (trail: string[]) => void;
  onReveal: (path: string) => void;
  onScanFolder: (path: string) => void;
  scanning: boolean;
}

const iconButton =
  "p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-violet-400";

export const FolderBrowser: React.FC<FolderBrowserProps> = ({ root, trail, setTrail, onReveal, onScanFolder, scanning }) => {
  const t = useT();
  const chain = resolveTrail(root, trail);
  const current = chain[chain.length - 1];
  const rows = folderRows(current);
  const parentSize = Math.max(1, current.size_bytes);
  const lang = useI18nStore((s) => s.lang);
  const num = (n: number) => n.toLocaleString(lang);

  return (
    <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label={t("space.folders")} className="flex flex-wrap items-center gap-1 text-sm min-w-0">
          {chain.map((e, i) => (
            <React.Fragment key={e.path}>
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden />}
              <button
                type="button"
                onClick={() => setTrail(trail.slice(0, i))}
                aria-current={i === chain.length - 1 ? "location" : undefined}
                className={cn(
                  "px-1.5 py-0.5 rounded-md truncate max-w-56 cursor-pointer hover:bg-slate-800",
                  i === chain.length - 1 ? "text-white font-semibold" : "text-slate-400",
                )}
                title={e.path}
              >
                {e.name}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          {chain.length > 1 && (
            <>
              <button type="button" onClick={() => setTrail(trail.slice(0, chain.length - 2))} className={iconButton} title={t("space.up")} aria-label={t("space.up")}>
                <CornerLeftUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onScanFolder(current.path)}
                disabled={scanning}
                className={iconButton}
                title={t("space.rescanHere")}
                aria-label={t("space.rescanHere")}
              >
                <FolderSearch className="w-4 h-4" />
              </button>
            </>
          )}
          <button type="button" onClick={() => onReveal(current.path)} className={iconButton} title={t("space.reveal")} aria-label={t("space.reveal")}>
            <FolderOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{t("space.empty")}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const pct = (row.size / parentSize) * 100;
            const canOpen = row.kind === "dir" && row.entry.children.length > 0;
            const canScan = row.kind === "dir" && !canOpen && row.entry.dir_count > 0;
            const label =
              row.kind === "dir"
                ? row.entry.name
                : row.kind === "files"
                  ? t("space.ownFiles", { n: num(row.count) })
                  : t("space.otherFolders", { n: num(row.count) });
            const Icon = row.kind === "dir" ? Folder : row.kind === "files" ? FileText : Layers;
            const meta =
              row.kind === "dir" ? t("space.filesCount", { n: num(row.entry.file_count) }) : row.kind === "other" ? t("space.otherFoldersHint") : "";

            const body = (
              <>
                <Icon className={cn("w-4 h-4 shrink-0", row.kind === "dir" ? "text-violet-400" : "text-slate-500")} aria-hidden />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate text-sm", row.kind === "dir" ? "text-slate-200" : "text-slate-400 italic")}>
                      {label}
                      {row.kind === "dir" && row.entry.access_denied && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] not-italic text-amber-400">
                          <ShieldAlert className="w-3 h-3" aria-hidden />
                          {t("space.noAccess")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-sm text-slate-200 tabular-nums">{formatBytes(row.size)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
                      <div
                        className={cn("h-full rounded-full", row.kind === "dir" ? "bg-violet-500" : "bg-slate-500")}
                        style={{ width: `${Math.max(pct > 0 ? 0.5 : 0, Math.min(100, pct))}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs text-slate-500 tabular-nums">{pct.toFixed(pct < 10 ? 1 : 0)}%</span>
                  </div>
                  {meta && <p className="text-[11px] text-slate-500 truncate">{meta}</p>}
                </div>
              </>
            );

            return (
              <li key={row.key} className="group flex items-center gap-1 rounded-lg hover:bg-slate-800/40">
                {canOpen ? (
                  <button
                    type="button"
                    onClick={() => setTrail([...trail.slice(0, chain.length - 1), row.entry.path])}
                    className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-violet-400"
                    title={t("space.open")}
                  >
                    {body}
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 shrink-0" aria-hidden />
                  </button>
                ) : (
                  <div className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2">
                    {body}
                    <span className="w-4 shrink-0" aria-hidden />
                  </div>
                )}
                {/* Vaste breedte, zodat grootte en balk in elke regel op dezelfde plek staan. */}
                {row.kind !== "dir" && <span className="w-16 shrink-0" aria-hidden />}
                {row.kind === "dir" && (
                  <div className="flex items-center justify-end w-16 shrink-0 pr-1">
                    {canScan && (
                      <button
                        type="button"
                        onClick={() => onScanFolder(row.entry.path)}
                        disabled={scanning}
                        className={iconButton}
                        title={t("space.scanFolder")}
                        aria-label={`${t("space.scanFolder")}: ${row.entry.name}`}
                      >
                        <FolderSearch className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onReveal(row.entry.path)}
                      className={iconButton}
                      title={t("space.reveal")}
                      aria-label={`${t("space.reveal")}: ${row.entry.name}`}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
