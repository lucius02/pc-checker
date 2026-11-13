import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CornerDownLeft,
  FileDown,
  Languages,
  PanelLeft,
  Pause,
  Play,
  PlayCircle,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { translate, useI18nStore, useT, type MessageKey } from "../../i18n";
import { useDiagnosticsStore } from "../../store/diagnosticsStore";
import { useUiStore } from "../../store/uiStore";
import { ALL_TABS, TAB_ICONS, tabLabelKey, type TabIcon } from "../../lib/navItems";
import { anyTestRunning, quickActionFor } from "../../lib/tabActions";
import { planHealthTests } from "../../lib/healthTests";
import { exportReport } from "../../lib/exportReport";
import { cn } from "../../utils/cn";

type Group = "nav" | "run" | "app";

interface PaletteItem {
  id: string;
  group: Group;
  label: string;
  /** Extra zoektekst: het label in de andere taal, zodat zoeken in beide talen werkt. */
  keywords: string;
  icon: TabIcon;
  /** Sneltoets, rechts getoond. */
  shortcut?: string;
  /** Waarom de actie nu niet kan (dan is hij uitgeschakeld). */
  disabledReason?: string;
  run: () => void;
}

const GROUP_TITLE: Record<Group, MessageKey> = { nav: "pal.group.nav", run: "pal.group.run", app: "pal.group.app" };
const GROUP_ORDER: Group[] = ["nav", "run", "app"];

/** Beide vertalingen van een sleutel, als zoektekst. */
const bothLangs = (key: MessageKey, vars?: Record<string, string | number>) =>
  `${translate("nl", key, vars)} ${translate("en", key, vars)}`;

/** Elk woord van de zoekopdracht moet ergens in het label of de zoektekst voorkomen. */
function matches(item: PaletteItem, query: string): boolean {
  const haystack = `${item.label} ${item.keywords}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function usePaletteItems(): PaletteItem[] {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const d = useDiagnosticsStore(
    useShallow((s) => ({
      powerData: s.powerData,
      freezeData: s.freezeData,
      driverReport: s.driverReport,
      storageReport: s.storageReport,
      batteryReport: s.batteryReport,
      latencyResult: s.latencyResult,
      diskResult: s.diskResult,
      ramResult: s.ramResult,
      cpuResult: s.cpuResult,
      autoRefresh: s.autoRefresh,
      canElevate: s.elevation?.can_elevate ?? false,
    })),
  );
  const testRunning = useDiagnosticsStore(anyTestRunning);

  return useMemo(() => {
    const { navigate, toggleSidebar } = useUiStore.getState();
    const store = () => useDiagnosticsStore.getState();
    const busyReason = testRunning ? t("pal.busy") : undefined;
    const items: PaletteItem[] = [];

    for (const tab of ALL_TABS) {
      items.push({
        id: `nav:${tab}`,
        group: "nav",
        label: t(tabLabelKey(tab)),
        keywords: bothLangs(tabLabelKey(tab)),
        icon: TAB_ICONS[tab],
        run: () => navigate(tab),
      });
    }

    const plan = planHealthTests(d);
    items.push({
      id: "run:all",
      group: "run",
      label: plan.mode === "all" ? t("hs.testAll") : t("hs.testUntested", { n: plan.steps.length }),
      keywords: `${bothLangs("hs.testAll")} ${bothLangs("pal.kw.testAll")}`,
      icon: PlayCircle,
      disabledReason: busyReason,
      run: () => {
        navigate("overview");
        void store().runHealthTests();
      },
    });
    for (const tab of ALL_TABS) {
      const action = quickActionFor(tab, d);
      if (!action) continue;
      items.push({
        id: `run:${tab}`,
        group: "run",
        label: t("act.start", { name: t(action.label) }),
        keywords: `${bothLangs("act.start", { name: "" })} ${bothLangs(action.label)} ${bothLangs(tabLabelKey(tab))}`,
        icon: Play,
        disabledReason: busyReason,
        run: () => {
          // Naar het tabblad, zodat de voortgang en het resultaat meteen te zien zijn.
          navigate(tab);
          void action.run(store());
        },
      });
    }

    items.push(
      {
        id: "app:refresh",
        group: "app",
        label: t("header.refreshNow"),
        keywords: bothLangs("header.refreshNow"),
        icon: RefreshCw,
        run: () => void store().fetchOverview(),
      },
      {
        id: "app:autoRefresh",
        group: "app",
        label: d.autoRefresh ? t("pal.pause") : t("pal.resume"),
        keywords: `${bothLangs("pal.pause")} ${bothLangs("pal.resume")} live`,
        icon: d.autoRefresh ? Pause : Play,
        run: () => store().setAutoRefresh(!d.autoRefresh),
      },
      {
        id: "app:sidebar",
        group: "app",
        label: t("pal.toggleSidebar"),
        keywords: `${bothLangs("pal.toggleSidebar")} sidebar`,
        icon: PanelLeft,
        shortcut: "Ctrl B",
        run: toggleSidebar,
      },
      {
        id: "app:lang",
        group: "app",
        label: lang === "nl" ? "Switch to English" : "Schakel naar Nederlands",
        keywords: "language taal english nederlands dutch engels",
        icon: Languages,
        run: () => setLang(lang === "nl" ? "en" : "nl"),
      },
      {
        id: "app:exportHtml",
        group: "app",
        label: `${t("header.export")}: ${t("header.exportHtml")}`,
        keywords: `${bothLangs("header.export")} pdf`,
        icon: FileDown,
        run: () => void exportReport("html"),
      },
      {
        id: "app:exportJson",
        group: "app",
        label: `${t("header.export")}: ${t("header.exportJson")}`,
        keywords: bothLangs("header.export"),
        icon: FileDown,
        run: () => void exportReport("json"),
      },
      {
        id: "app:print",
        group: "app",
        label: t("header.print"),
        keywords: bothLangs("header.print"),
        icon: Printer,
        run: () => window.print(),
      },
    );
    if (d.canElevate) {
      items.push({
        id: "app:admin",
        group: "app",
        label: t("header.restartAdmin"),
        keywords: `${bothLangs("header.restartAdmin")} admin uac`,
        icon: ShieldAlert,
        run: () => void store().restartAsAdmin(),
      });
    }
    return items;
  }, [t, lang, setLang, d, testRunning]);
}

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] font-sans font-medium text-slate-400">
    {children}
  </kbd>
);

const PaletteDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const items = usePaletteItems();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Gegroepeerd in vaste volgorde; `flat` is dezelfde volgorde voor de pijltjestoetsen.
  const flat = useMemo(() => {
    const filtered = items.filter((item) => matches(item, query));
    return GROUP_ORDER.flatMap((g) => filtered.filter((item) => item.group === g));
  }, [items, query]);
  const index = Math.min(selected, Math.max(0, flat.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, query]);

  const execute = (item: PaletteItem | undefined) => {
    if (!item || item.disabledReason) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(flat.length ? (index + 1) % flat.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(flat.length ? (index - 1 + flat.length) % flat.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(flat[index]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="backdrop-in fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 backdrop-blur-sm pt-[12vh] px-4 print:hidden"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("pal.title")}
        onKeyDown={onKeyDown}
        className="palette-in w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60 overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder={t("pal.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={flat[index] ? `palette-${flat[index].id}` : undefined}
            className="flex-1 bg-transparent py-3.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none select-text"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {flat.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">{t("pal.empty")}</p>}
          {flat.map((item, i) => {
            const Icon = item.icon;
            const isSelected = i === index;
            const firstOfGroup = i === 0 || flat[i - 1].group !== item.group;
            return (
              <React.Fragment key={item.id}>
                {firstOfGroup && (
                  <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {t(GROUP_TITLE[item.group])}
                  </div>
                )}
                <div
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={!!item.disabledReason}
                  onMouseMove={() => setSelected(i)}
                  onClick={() => execute(item)}
                  className={cn(
                    "flex items-center gap-3 px-3 h-9 rounded-lg text-sm cursor-pointer",
                    isSelected ? "bg-cyan-500/15 text-cyan-100" : "text-slate-300",
                    item.disabledReason && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", isSelected ? "text-cyan-300" : "text-slate-500")} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.disabledReason ? (
                    <span className="text-xs text-slate-500 shrink-0">{item.disabledReason}</span>
                  ) : item.shortcut ? (
                    <Kbd>{item.shortcut}</Kbd>
                  ) : (
                    isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-cyan-400/70 shrink-0" />
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-800 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t("pal.hint.move")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> {t("pal.hint.select")}
          </span>
          <span className="flex items-center gap-1.5 ml-auto">
            <Kbd>Alt</Kbd>
            <Kbd>←</Kbd> {t("pal.hint.back")}
          </span>
        </div>
      </div>
    </div>
  );
};

/** Zoek- en commandovenster (Ctrl+K): naar een tabblad springen of een test starten. */
export const CommandPalette: React.FC = () => {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  // Het dialoogvenster wordt bij elke opening opnieuw opgebouwd, dus zoekveld en selectie beginnen leeg.
  return open ? <PaletteDialog onClose={() => setOpen(false)} /> : null;
};
