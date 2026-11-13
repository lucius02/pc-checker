import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { t, useI18nStore } from "../i18n";
import { useDiagnosticsStore } from "../store/diagnosticsStore";
import { toast } from "../store/toastStore";
import { buildHtmlReport, buildJsonReport, reportFileName, type ReportSnapshot } from "../utils/report";
import { errorMessage } from "./api";

function snapshot(): ReportSnapshot {
  const s = useDiagnosticsStore.getState();
  return {
    data: s.data,
    powerData: s.powerData,
    coolingData: s.coolingData,
    freezeData: s.freezeData,
    batteryReport: s.batteryReport,
    powerDeliveryReport: s.powerDeliveryReport,
    driverReport: s.driverReport,
    latencyResult: s.latencyResult,
    storageReport: s.storageReport,
    history: s.history,
    healthScore: s.healthScore,
    cpuResult: s.cpuResult,
    ramResult: s.ramResult,
    diskResult: s.diskResult,
    gpuResult: s.gpuResult,
    peripherals: s.peripherals,
  };
}

/**
 * Laat de gebruiker een locatie kiezen en schrijft het rapport weg. Het dialoogvenster geeft de
 * fs-plugin automatisch toestemming voor precies dat ene pad.
 */
export async function exportReport(format: "html" | "json"): Promise<void> {
  try {
    // Historie meenemen in het rapport, ook als de Historie-tab nooit is geopend.
    if (!useDiagnosticsStore.getState().history) {
      await useDiagnosticsStore.getState().loadHistory();
    }
    const snap = snapshot();
    const contents =
      format === "html" ? buildHtmlReport(snap, useI18nStore.getState().lang) : buildJsonReport(snap);
    const path = await save({
      defaultPath: reportFileName(format),
      filters: [format === "html" ? { name: "HTML", extensions: ["html"] } : { name: "JSON", extensions: ["json"] }],
    });
    if (!path) return; // geannuleerd
    await writeTextFile(path, contents);
    toast.success(t("toast.exported"), path);
  } catch (err) {
    toast.error(t("error.export"), errorMessage(err));
  }
}
