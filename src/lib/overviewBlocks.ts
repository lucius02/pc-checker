import type { MessageKey } from "../i18n";
import { compareDisk } from "./diskReference";
import type { DiagnosticsState } from "../store/diagnosticsStore";
import { burnInPassed, type TabType } from "../types";

/** Uitkomst van één test, zoals het blok in het systeemoverzicht hem toont. */
/** "partial": de test is begonnen maar niet af; "live": een sensor zonder testuitslag (koeling). */
export type BlockStatus = "untested" | "partial" | "good" | "warn" | "bad" | "live";

export type BlockGroup = "health" | "stress" | "devices";

export interface BlockMessage {
  key: MessageKey;
  vars?: Record<string, string | number>;
}

export interface OverviewBlock {
  id: TabType;
  group: BlockGroup;
  status: BlockStatus;
  /** Eén regel uitleg: het resultaat, of wat de test doet als hij nog niet gedraaid heeft. */
  detail: BlockMessage;
  /** Korte live waarde rechtsboven (bijv. "34%" of "52 °C"). */
  metric?: string;
  /** 0-100, voor de balk onder de titel. */
  bar?: number;
}

export type OverviewSlice = Pick<
  DiagnosticsState,
  | "data"
  | "powerData"
  | "coolingData"
  | "freezeData"
  | "driverReport"
  | "latencyResult"
  | "storageReport"
  | "batteryReport"
  | "powerDeliveryReport"
  | "cpuResult"
  | "ramResult"
  | "diskResult"
  | "gpuResult"
  | "burninResult"
  | "peripherals"
>;

/** Alle tabbladen met een test, in de volgorde van de navigatie, per groep. */
export const OVERVIEW_BLOCK_ORDER: { id: TabType; group: BlockGroup }[] = [
  { id: "freeze", group: "health" },
  { id: "latency", group: "health" },
  { id: "drivers", group: "health" },
  { id: "storage", group: "health" },
  { id: "power", group: "health" },
  { id: "cooling", group: "health" },
  { id: "cpu", group: "stress" },
  { id: "ram", group: "stress" },
  { id: "disk", group: "stress" },
  { id: "gpu", group: "stress" },
  { id: "burnin", group: "stress" },
  { id: "keyboard", group: "devices" },
  { id: "screen", group: "devices" },
  { id: "touchpad", group: "devices" },
  { id: "audio", group: "devices" },
  { id: "camera", group: "devices" },
  { id: "network", group: "devices" },
];

const pct = (part: number, total: number) => Math.min(100, Math.max(0, Math.round((part / Math.max(1, total)) * 100)));

type Result = Omit<OverviewBlock, "id" | "group">;
const untested = (key: MessageKey, extra?: Partial<Result>): Result => ({ status: "untested", detail: { key }, ...extra });

function blockFor(id: TabType, s: OverviewSlice): Result {
  switch (id) {
    case "freeze": {
      const f = s.freezeData;
      if (!f) return untested("blk.freeze.hint");
      const risk = f.system_freeze_risk;
      return {
        status: risk === "Hoog" ? "bad" : risk === "Middel" ? "warn" : "good",
        detail: { key: "blk.freeze.result", vars: { n: f.event_log_culprits.length, w: f.watchdog_freezes_detected.length } },
      };
    }
    case "latency": {
      const l = s.latencyResult;
      if (!l || !l.success) return untested("blk.latency.hint");
      return {
        status: l.verdict === "Slecht" ? "bad" : l.verdict === "Matig" ? "warn" : "good",
        detail: { key: "blk.latency.result", vars: { max: Math.round(l.timer_max_gap_us), p99: Math.round(l.timer_p99_gap_us) } },
      };
    }
    case "drivers": {
      const d = s.driverReport;
      if (!d || !d.is_available) return untested("blk.drivers.hint");
      return {
        status: d.problem_count > 0 ? "bad" : d.outdated_count + d.unsigned_count > 0 ? "warn" : "good",
        detail: {
          key: "blk.drivers.result",
          vars: { n: d.total_drivers, p: d.problem_count, o: d.outdated_count + d.unsigned_count },
        },
      };
    }
    case "storage": {
      const r = s.storageReport;
      if (!r || !r.is_available) return untested("blk.storage.hint");
      return {
        status: r.critical_count > 0 ? "bad" : r.warning_count > 0 ? "warn" : "good",
        detail: { key: "blk.storage.result", vars: { n: r.disks.length, w: r.warning_count + r.critical_count } },
      };
    }
    case "power": {
      const p = s.powerData;
      const live =
        p?.battery_percent !== null && p?.battery_percent !== undefined
          ? { metric: `${p.battery_percent}%`, bar: p.battery_percent }
          : {};
      const b = s.batteryReport;
      if (b && b.is_available) {
        return {
          ...live,
          status: b.health_percent < 60 ? "bad" : b.health_percent < 80 ? "warn" : "good",
          detail: { key: "blk.power.battery", vars: { p: b.health_percent.toFixed(0), c: b.cycle_count } },
        };
      }
      const d = s.powerDeliveryReport;
      if (d) {
        return {
          ...live,
          status: !d.is_sufficient ? "bad" : d.dirty_shutdowns_count + d.throttling_events_count > 0 ? "warn" : "good",
          detail: { key: "blk.power.delivery", vars: { s: d.score, d: d.dirty_shutdowns_count } },
        };
      }
      return untested(p?.battery_present ? "blk.power.hintBattery" : "blk.power.hint", live);
    }
    case "cooling": {
      const c = s.coolingData;
      if (!c) return untested("blk.cooling.hint");
      const hottest = c.temperatures.reduce<number | null>(
        (m, t) => (t.temperature_celsius > 0 && (m === null || t.temperature_celsius > m) ? t.temperature_celsius : m),
        null,
      );
      const fans = c.fans.length;
      const live = hottest !== null ? { metric: `${hottest.toFixed(0)}°C`, bar: Math.min(100, hottest) } : {};
      if (c.is_throttling_suspected) return { ...live, status: "bad", detail: { key: "blk.cooling.hot" } };
      return {
        ...live,
        status: "live",
        detail: fans > 0 ? { key: "blk.cooling.fans", vars: { n: fans } } : { key: "blk.cooling.ok" },
      };
    }
    case "cpu": {
      const usage = s.data ? { metric: `${s.data.cpu.global_usage.toFixed(0)}%`, bar: s.data.cpu.global_usage } : {};
      const r = s.cpuResult;
      if (!r) return untested("blk.cpu.hint", usage);
      return r.success
        ? { ...usage, status: "good", detail: { key: "blk.score", vars: { v: `${r.score_or_speed.toFixed(1)} ${r.unit}` } } }
        : { ...usage, status: "bad", detail: { key: "blk.cpu.failed" } };
    }
    case "ram": {
      const m = s.data?.ram;
      const usage = m ? { metric: `${pct(m.used_bytes, m.total_bytes)}%`, bar: pct(m.used_bytes, m.total_bytes) } : {};
      const r = s.ramResult;
      if (!r) return untested("blk.ram.hint", usage);
      return r.success
        ? { ...usage, status: "good", detail: { key: "blk.ram.ok" } }
        : { ...usage, status: "bad", detail: { key: "blk.ram.failed" } };
    }
    case "disk": {
      const d = s.data?.disks[0];
      const usage = d
        ? { metric: `${pct(d.total_bytes - d.available_bytes, d.total_bytes)}%`, bar: pct(d.total_bytes - d.available_bytes, d.total_bytes) }
        : {};
      const r = s.diskResult;
      if (!r) return untested("blk.disk.hint", usage);
      if (!r.success) return { ...usage, status: "bad", detail: { key: "blk.disk.failed" } };
      const sp = r.disk_speeds;
      if (!sp) return { ...usage, status: "good", detail: { key: "blk.score", vars: { v: `${r.score_or_speed.toFixed(0)} ${r.unit}` } } };
      const cmp = compareDisk(sp);
      const slow = [cmp.read, cmp.write].some((x) => x === "bad");
      return {
        ...usage,
        status: slow ? "warn" : "good",
        detail: { key: "blk.disk.speeds", vars: { r: Math.round(sp.read_mbps), w: Math.round(sp.write_mbps) } },
      };
    }
    case "gpu": {
      const r = s.gpuResult;
      if (!r) return untested("blk.gpu.hint");
      // De samenvatting begint met het oordeel ("OK", "FPS DROPS", "CONTEXT LOST"), daarna de cijfers.
      const [verdict, rest = ""] = r.split(" — ");
      return {
        status: verdict === "OK" ? "good" : verdict === "CONTEXT LOST" ? "bad" : "warn",
        detail: { key: "blk.raw", vars: { v: rest.split(",")[0] || r } },
      };
    }
    case "burnin": {
      const r = s.burninResult;
      if (!r) return untested("blk.burnin.hint");
      const failed = [!r.cpuOk && "CPU", !r.ramOk && "RAM", !r.gpuOk && "GPU"].filter(Boolean).join(", ");
      if (burnInPassed(r)) {
        return {
          status: "good",
          detail: r.maxTemp !== null ? { key: "blk.burnin.okTemp", vars: { t: r.maxTemp.toFixed(0) } } : { key: "blk.burnin.ok" },
        };
      }
      return {
        status: "bad",
        detail: failed
          ? { key: "blk.burnin.failed", vars: { v: failed } }
          : r.freezes > 0
            ? { key: "blk.burnin.freezes", vars: { n: r.freezes } }
            : { key: "blk.burnin.hot", vars: { t: (r.maxTemp ?? 0).toFixed(0) } },
      };
    }
    case "keyboard": {
      const k = s.peripherals.keyboard;
      if (!k || k.testedKeys === 0) return untested("blk.keyboard.hint");
      const p = pct(k.testedKeys, k.totalKeys);
      return {
        status: p >= 100 ? "good" : "partial",
        metric: `${p}%`,
        bar: p,
        detail: { key: "blk.keyboard.result", vars: { n: k.testedKeys, t: k.totalKeys, r: k.maxRollover } },
      };
    }
    case "screen": {
      const sc = s.peripherals.screen;
      if (!sc) return untested("blk.screen.hint");
      return {
        status: "good",
        metric: sc.refreshRateHz > 0 ? `${Math.round(sc.refreshRateHz)} Hz` : undefined,
        detail: {
          key: "blk.screen.result",
          vars: { w: Math.round(sc.width * sc.dpr), h: Math.round(sc.height * sc.dpr), d: sc.colorDepth },
        },
      };
    }
    case "touchpad": {
      const tp = s.peripherals.touchpad;
      if (!tp || (tp.coveragePercent === 0 && tp.doubleClickMs === null && tp.scrollSteps === 0)) return untested("blk.touchpad.hint");
      if (tp.hasSwitchChatter) return { status: "bad", detail: { key: "blk.touchpad.chatter" } };
      return {
        status: tp.coveragePercent >= 90 ? "good" : "partial",
        metric: `${Math.round(tp.coveragePercent)}%`,
        bar: tp.coveragePercent,
        detail: { key: "blk.touchpad.result", vars: { p: Math.round(tp.coveragePercent), hz: Math.round(tp.pollingRateHz) } },
      };
    }
    case "audio": {
      const a = s.peripherals.audio;
      if (!a || (!a.stereoTested && !a.frequenciesTested && !a.micWorking)) return untested("blk.audio.hint");
      const done = [a.stereoTested, a.frequenciesTested, a.micWorking].filter(Boolean).length;
      return {
        status: done === 3 ? "good" : "partial",
        detail: { key: "blk.audio.result", vars: { n: done } },
      };
    }
    case "camera": {
      const c = s.peripherals.camera;
      if (!c || !c.tested) return untested("blk.camera.hint");
      return {
        status: c.fps > 0 && c.fps < 15 ? "warn" : "good",
        metric: c.fps > 0 ? `${Math.round(c.fps)} FPS` : undefined,
        detail: { key: "blk.raw", vars: { v: `${c.resolution} · ${c.cameraName}` } },
      };
    }
    case "network": {
      const n = s.peripherals.network;
      if (n && !n.online) return { status: "bad", detail: { key: "blk.network.offline" } };
      if (!n || (n.avgPingMs === 0 && n.packetLossPercent === 0)) return untested("blk.network.hint");
      const loss = n.packetLossPercent;
      return {
        status: loss >= 5 ? "bad" : loss > 0 || n.jitterMs > 30 || n.avgPingMs > 100 ? "warn" : "good",
        metric: `${Math.round(n.avgPingMs)} ms`,
        detail: { key: "blk.network.result", vars: { j: n.jitterMs.toFixed(0), l: loss === 0 ? "0" : loss.toFixed(loss < 10 ? 1 : 0) } },
      };
    }
    default:
      return untested("blk.raw");
  }
}

/** Eén blok per testtabblad, met status, uitlegregel en eventueel een live waarde. */
export function buildOverviewBlocks(s: OverviewSlice): OverviewBlock[] {
  return OVERVIEW_BLOCK_ORDER.map(({ id, group }) => ({ id, group, ...blockFor(id, s) }));
}
