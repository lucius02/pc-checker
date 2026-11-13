import { translate, type Lang, type MessageKey } from "../i18n";
import { formatBytes, formatUptime } from "./formatters";
import { statusLabel } from "../i18n/status";
import type { DiagnosticsState } from "../store/diagnosticsStore";

/** Alleen de velden die het rapport nodig heeft (maakt de builder puur en testbaar). */
export type ReportSnapshot = Pick<
  DiagnosticsState,
  | "data"
  | "powerData"
  | "coolingData"
  | "freezeData"
  | "batteryReport"
  | "powerDeliveryReport"
  | "driverReport"
  | "latencyResult"
  | "storageReport"
  | "history"
  | "healthScore"
  | "cpuResult"
  | "ramResult"
  | "diskResult"
  | "gpuResult"
  | "peripherals"
>;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Status = "ok" | "warn" | "bad" | "na";

function badge(status: Status, text: string): string {
  return `<span class="badge ${status}">${escapeHtml(text)}</span>`;
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

/** Bouwt een zelfstandig, afdrukbaar HTML-rapport (geen externe resources). */
export function buildHtmlReport(s: ReportSnapshot, lang: Lang, now: Date = new Date()): string {
  const tr = (k: MessageKey, vars?: Record<string, string | number>) => translate(lang, k, vars);
  const st = (code: string) => statusLabel(lang, code);
  const na = badge("na", tr("report.notRun"));
  const parts: string[] = [];

  // Systeem
  if (s.data) {
    const d = s.data;
    parts.push(
      section(
        tr("report.system"),
        `<table>${[
          row("OS", escapeHtml(`${d.os_name} ${d.os_version} (kernel ${d.kernel_version})`)),
          row("Host", escapeHtml(d.host_name)),
          row(tr("report.type"), escapeHtml(s.powerData?.is_laptop ? tr("machine.laptop") : tr("machine.desktop"))),
          row("CPU", escapeHtml(`${d.cpu.brand} — ${d.cpu.physical_cores}C/${d.cpu.logical_cores}T`)),
          row("RAM", escapeHtml(tr("report.ramUsed", { t: formatBytes(d.ram.total_bytes), u: formatBytes(d.ram.used_bytes) }))),
          row("GPU", escapeHtml(d.gpus.map((g) => `${g.name} ${g.driver_version}`.trim()).join("; "))),
          row(
            tr("report.board"),
            escapeHtml(`${d.motherboard.manufacturer} ${d.motherboard.product} — ${d.motherboard.bios_vendor} ${d.motherboard.bios_version}`),
          ),
          row("Uptime", escapeHtml(`${formatUptime(d.session_uptime_secs, lang)} (${d.session_started_at})`)),
          row(
            tr("report.volumes"),
            escapeHtml(
              d.disks
                .map((x) => tr("report.volFree", { m: x.mount_point, f: formatBytes(x.available_bytes), t: formatBytes(x.total_bytes) }))
                .join("; "),
            ),
          ),
        ].join("")}</table>`,
      ),
    );
  }

  // Gezondheidsscore
  if (s.healthScore) {
    const h = s.healthScore;
    const tone: Status = h.score >= 80 ? "ok" : h.score >= 60 ? "warn" : "bad";
    parts.push(
      section(
        tr("report.health"),
        `<p class="score">${badge(tone, `${h.grade} · ${h.score}/100 · ${st(h.label)}`)}</p>
        <table>${h.categories
          .map((c) => row(c.label, `${badge(c.status === "Goed" ? "ok" : c.status === "Kritiek" ? "bad" : c.status === "Niet getest" ? "na" : "warn", `${st(c.status)} ${c.score}`)} ${escapeHtml(c.detail)}`))
          .join("")}</table>
        ${h.top_issues.length ? `<ul>${h.top_issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""}`,
      ),
    );
  }

  // Tests
  const stress = (r: ReportSnapshot["cpuResult"]) =>
    r
      ? `${badge(r.success ? "ok" : "bad", r.success ? "OK" : tr("report.fail"))} ${escapeHtml(`${r.score_or_speed.toFixed(1)} ${r.unit} — ${r.details}`)}`
      : na;
  parts.push(
    section(
      tr("report.tests"),
      `<table>${[
        row("CPU", stress(s.cpuResult)),
        row("RAM", stress(s.ramResult)),
        row(tr("report.disk"), stress(s.diskResult)),
        row("GPU", s.gpuResult ? escapeHtml(s.gpuResult) : na),
        row(
          tr("report.latency"),
          s.latencyResult
            ? `${badge(s.latencyResult.verdict === "Goed" ? "ok" : s.latencyResult.verdict === "Slecht" ? "bad" : "warn", st(s.latencyResult.verdict))} ${escapeHtml(`max ${s.latencyResult.timer_max_gap_us.toFixed(0)} µs, p99 ${s.latencyResult.timer_p99_gap_us.toFixed(0)} µs — ${s.latencyResult.summary}`)}`
            : na,
        ),
      ].join("")}</table>`,
    ),
  );

  // Freeze
  if (s.freezeData) {
    const f = s.freezeData;
    const risk: Status = f.system_freeze_risk === "Hoog" ? "bad" : f.system_freeze_risk === "Middel" ? "warn" : "ok";
    parts.push(
      section(
        tr("report.freeze"),
        `<p>${badge(risk, st(f.system_freeze_risk))} ${escapeHtml(f.diagnosis_summary)}</p>
        ${f.event_log_culprits.length ? `<table>${f.event_log_culprits.slice(0, 15).map((e) => row(e.timestamp, `<b>${escapeHtml(e.category)}</b> (${escapeHtml(e.provider)} #${e.event_id}) — ${escapeHtml(e.suggestion)}`)).join("")}</table>` : ""}
        <ol>${f.recommended_actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ol>`,
      ),
    );
  }

  // Opslag
  if (s.storageReport?.is_available) {
    parts.push(
      section(
        tr("report.storage"),
        `<p>${escapeHtml(s.storageReport.summary)}</p><table>${s.storageReport.disks
          .map((d) =>
            row(
              `${d.model} (${d.bus_type} ${d.media_type})`,
              `${badge(d.verdict === "Goed" ? "ok" : d.verdict === "Kritiek" ? "bad" : "warn", st(d.verdict))} ${escapeHtml(
                [
                  d.wear_percent != null ? tr("report.wear", { p: d.wear_percent }) : null,
                  d.temperature_celsius != null ? `${d.temperature_celsius} °C` : null,
                  d.power_on_hours != null ? tr("report.hours", { h: d.power_on_hours }) : null,
                  ...d.findings,
                ]
                  .filter(Boolean)
                  .join(" · "),
              )}`,
            ),
          )
          .join("")}</table>`,
      ),
    );
  }

  // Drivers
  if (s.driverReport?.is_available) {
    const r = s.driverReport;
    const flagged = r.entries.filter((d) => d.status !== "OK").slice(0, 20);
    parts.push(
      section(
        tr("report.drivers"),
        `<p>${escapeHtml(r.summary)}</p>${flagged.length ? `<table>${flagged.map((d) => row(d.device_name, `${badge(d.status === "Probleem" ? "bad" : "warn", st(d.status))} ${escapeHtml(`${d.provider} ${d.version} (${d.date || "?"}) — ${d.advice}`)}`)).join("")}</table>` : ""}`,
      ),
    );
  }

  // Stroom & koeling
  const powerRows: string[] = [];
  if (s.powerData) powerRows.push(row(tr("report.supply"), escapeHtml(s.powerData.details)));
  if (s.batteryReport) {
    powerRows.push(
      row(
        tr("report.battery"),
        s.batteryReport.is_available
          ? escapeHtml(tr("report.batteryText", { h: s.batteryReport.health_percent.toFixed(0), c: s.batteryReport.cycle_count, g: st(s.batteryReport.grade) }))
          : escapeHtml(s.batteryReport.advice),
      ),
    );
  }
  if (s.powerDeliveryReport) powerRows.push(row(tr("report.delivery"), escapeHtml(`${s.powerDeliveryReport.score}/100 — ${s.powerDeliveryReport.summary}`)));
  if (powerRows.length) parts.push(section(tr("report.power"), `<table>${powerRows.join("")}</table>`));

  if (s.coolingData) {
    parts.push(
      section(
        tr("report.cooling"),
        `<p>${escapeHtml(s.coolingData.summary)}</p><table>${s.coolingData.temperatures
          .filter((x) => x.temperature_celsius > 0)
          .map((x) => row(x.label, `${badge(x.temperature_celsius >= 90 ? "bad" : x.temperature_celsius >= 80 ? "warn" : "ok", `${x.temperature_celsius.toFixed(0)} °C`)}`))
          .join("")}</table>`,
      ),
    );
  }

  // Randapparatuur
  const p = s.peripherals;
  const periph = Object.entries(p).filter(([, v]) => v != null);
  if (periph.length) {
    parts.push(
      section(
        tr("report.peripherals"),
        `<table>${periph.map(([k, v]) => row(k, escapeHtml(JSON.stringify(v)))).join("")}</table>`,
      ),
    );
  }

  // Historie
  if (s.history && (s.history.freezes.length || s.history.health.length)) {
    const weekAgo = now.getTime() - 7 * 86400_000;
    const recent = s.history.freezes.filter((f) => f.at_epoch_ms >= weekAgo).length;
    parts.push(
      section(
        tr("report.history"),
        `<p>${escapeHtml(tr("report.historyText", { n: s.history.freezes.length, r: recent, s: s.history.health.length }))}</p>`,
      ),
    );
  }

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(tr("report.title"))}</title>
<style>
:root{--bg:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--ok:#047857;--warn:#b45309;--bad:#b91c1c;--na:#64748b}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--fg:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--ok:#34d399;--warn:#fbbf24;--bad:#f87171;--na:#94a3b8}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Segoe UI,sans-serif;max-width:960px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
.meta{color:var(--muted);margin:4px 0 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--line)}
th{width:28%;font-weight:600;color:var(--muted)}.badge{display:inline-block;padding:1px 8px;border-radius:999px;border:1px solid currentColor;font-size:12px;font-weight:600;margin-right:6px}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.na{color:var(--na)}.score .badge{font-size:16px;padding:4px 12px}
@media print{body{max-width:none}section{break-inside:avoid}}
</style></head><body>
<h1>${escapeHtml(tr("report.title"))}</h1>
<p class="meta">${escapeHtml(tr("report.generated"))} ${escapeHtml(now.toLocaleString(lang === "nl" ? "nl-NL" : "en-GB"))}${s.data ? ` · ${escapeHtml(s.data.host_name)}` : ""}</p>
${parts.join("\n")}
</body></html>`;
}

/** Ruwe JSON-export (voor ontwikkelaars / forums die alle details willen). */
export function buildJsonReport(s: ReportSnapshot, now: Date = new Date()): string {
  return JSON.stringify({ exportTimestamp: now.toISOString(), ...s }, null, 2);
}

export function reportFileName(ext: "html" | "json", now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `pc-checker-rapport-${stamp}.${ext}`;
}
