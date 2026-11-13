import React, { useState } from "react";
import { File, FolderOpen } from "lucide-react";
import type { LargeFile } from "../../../types";
import { useI18nStore, useT } from "../../../i18n";
import { formatBytes } from "../../../utils/formatters";
import { parentDir } from "../../../lib/spaceTree";

const INITIAL = 15;

export const LargestFiles: React.FC<{ files: LargeFile[]; onReveal: (path: string) => void }> = ({ files, onReveal }) => {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? files : files.slice(0, INITIAL);
  const lang = useI18nStore((s) => s.lang);

  return (
    <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3">
      <div>
        <h3 className="font-semibold text-white">{t("space.largest")}</h3>
        <p className="text-xs text-slate-400">{t("space.largestIntro")}</p>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-slate-500">{t("space.noFiles")}</p>
      ) : (
        <ol className="divide-y divide-slate-800/70">
          {shown.map((f) => (
            <li key={f.path} className="flex items-center gap-3 py-2">
              <File className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate" title={f.name}>
                  {f.name}
                </p>
                <p className="text-[11px] text-slate-500 truncate" title={f.path}>
                  {parentDir(f.path)}
                  {f.modified_epoch_ms != null &&
                    ` · ${t("space.modified", { d: new Date(f.modified_epoch_ms).toLocaleDateString(lang) })}`}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm text-slate-200 tabular-nums">{formatBytes(f.size_bytes)}</span>
              <button
                type="button"
                onClick={() => onReveal(f.path)}
                className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-violet-400"
                title={t("space.reveal")}
                aria-label={`${t("space.reveal")}: ${f.name}`}
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
      {files.length > INITIAL && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-violet-300 hover:text-violet-200 underline cursor-pointer">
          {expanded ? t("space.showLess") : t("space.showMore", { n: files.length })}
        </button>
      )}
    </div>
  );
};
