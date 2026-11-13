import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import "./App.css";

import type { PeripheralTestResults, TabType } from "./types";
import { useDiagnosticsStore } from "./store/diagnosticsStore";
import { useUiStore } from "./store/uiStore";
import { startLiveMetrics } from "./store/liveMetricsStore";
import { CommandPalette } from "./components/palette/CommandPalette";
import { api } from "./lib/api";
import { useI18nStore, useT } from "./i18n";
import { Header } from "./components/Header";
import { Navigation } from "./components/Navigation";
import { Footer, type ConnectionState } from "./components/Footer";
import { Toaster } from "./components/Toaster";
import { UpdateNotice } from "./components/UpdateNotice";
import { OverviewTab } from "./components/tabs/OverviewTab";
import { PowerTab } from "./components/tabs/PowerTab";
import { CoolingTab } from "./components/tabs/CoolingTab";
import { FreezeTab } from "./components/tabs/FreezeTab";
import { CpuTab } from "./components/tabs/CpuTab";
import { RamTab } from "./components/tabs/RamTab";
import { DiskTab } from "./components/tabs/DiskTab";
import { LiveTab } from "./components/tabs/LiveTab";
import { ProcessesTab } from "./components/tabs/ProcessesTab";
import { DriversTab } from "./components/tabs/DriversTab";
import { LatencyTab } from "./components/tabs/LatencyTab";
import { StorageTab } from "./components/tabs/StorageTab";
import { HistoryTab } from "./components/tabs/HistoryTab";
import { GpuTab } from "./components/tabs/GpuTab";
import { BurnInTab } from "./components/tabs/BurnInTab";
import { KeyboardTab } from "./components/tabs/KeyboardTab";
import { ScreenTab } from "./components/tabs/ScreenTab";
import { TouchpadTab } from "./components/tabs/TouchpadTab";
import { AudioTab } from "./components/tabs/AudioTab";
import { CameraTab } from "./components/tabs/CameraTab";
import { NetworkTab } from "./components/tabs/NetworkTab";

const POLL_MS = 4000;

/** Tabs met eigen interactieve metingen of zware belasting: geen achtergrond-polling. */
const NO_POLL_TABS: TabType[] = ["keyboard", "screen", "touchpad", "audio", "camera", "network", "gpu", "burnin"];

/** Laadskelet in de vorm van het overzicht, zodat de pagina niet verspringt als de gegevens er zijn. */
function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-6" role="status" aria-label={label}>
      <div className="skeleton h-7 w-64" />
      <div className="skeleton h-56" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <p className="text-center text-sm text-slate-500">{label}</p>
    </div>
  );
}

export default function App() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.navigate);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const mainRef = useRef<HTMLDivElement>(null);

  // Eén abonnement op de secondemetingen voor de hele app (overzicht én Live Monitor).
  useEffect(() => startLiveMetrics(), []);

  // Sneltoetsen: Ctrl+K zoeken/commando's, Ctrl+B menu, Alt+←/→ en de zijknoppen van de muis
  // voor vorige/volgende tabblad. Niet op het toetsenbordtabblad: daar hoort elke toets bij de test.
  useEffect(() => {
    if (activeTab === "keyboard") return;
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
      } else if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        ui.toggleSidebar();
      } else if (e.altKey && !mod && e.key === "ArrowLeft") {
        e.preventDefault();
        ui.goBack();
      } else if (e.altKey && !mod && e.key === "ArrowRight") {
        e.preventDefault();
        ui.goForward();
      }
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        useUiStore.getState().goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        useUiStore.getState().goForward();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
  }, [activeTab]);

  // Elke pagina begint bovenaan.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);
  const s = useDiagnosticsStore();
  const { fetchOverview, scanFreezeDiagnostic, loadElevation, autoRefresh } = s;

  // Taal ook aan de backend doorgeven (samenvattingen/adviezen). Bij de eerste keer daarna de
  // opstartscans draaien, zodat ook die al in de juiste taal terugkomen; bij een latere
  // taalwissel alleen de live gegevens verversen (eerder gedraaide tests blijven in hun taal).
  const started = useRef(false);
  useEffect(() => {
    document.documentElement.lang = lang;
    const afterLanguage = () => {
      void fetchOverview();
      if (!started.current) {
        started.current = true;
        void scanFreezeDiagnostic();
        void loadElevation();
      }
    };
    api.setLanguage(lang).then(afterLanguage, afterLanguage);
  }, [lang, fetchOverview, scanFreezeDiagnostic, loadElevation]);

  const pollingSuspended = NO_POLL_TABS.includes(activeTab);
  useEffect(() => {
    if (!autoRefresh || pollingSuspended) return;
    const id = window.setInterval(() => void fetchOverview(), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchOverview, autoRefresh, pollingSuspended]);

  const connection: ConnectionState = s.overviewFailed
    ? "error"
    : !autoRefresh
      ? "paused"
      : pollingSuspended
        ? "suspended"
        : "live";

  const { data, setPeripheral } = s;
  // Stabiele callbacks: de tabbladen melden hun resultaat in een effect dat van deze functie
  // afhangt. Een nieuwe functie per render zou dan een eindeloze update-lus geven.
  const report = useMemo(
    () => ({
      keyboard: (r: PeripheralTestResults["keyboard"]) => setPeripheral("keyboard", r),
      screen: (r: PeripheralTestResults["screen"]) => setPeripheral("screen", r),
      touchpad: (r: PeripheralTestResults["touchpad"]) => setPeripheral("touchpad", r),
      audio: (r: PeripheralTestResults["audio"]) => setPeripheral("audio", r),
      camera: (r: PeripheralTestResults["camera"]) => setPeripheral("camera", r),
      network: (r: PeripheralTestResults["network"]) => setPeripheral("network", r),
    }),
    [setPeripheral],
  );

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans select-none print:h-auto print:overflow-visible">
      <Header pollingSuspended={pollingSuspended} />

      <div className="flex flex-1 min-h-0">
        <Navigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />

        <div ref={mainRef} className="flex-1 min-w-0 overflow-y-auto print:overflow-visible">
          <UpdateNotice />

          <main className="p-6 max-w-7xl w-full mx-auto space-y-6">
            {data && s.overviewFailed && (
              <div
                role="alert"
                className="px-4 py-3 bg-red-950/30 border border-red-900 rounded-xl text-red-300 text-xs flex items-center gap-3"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span className="flex-1">{t("app.staleData")}</span>
                <button
                  type="button"
                  onClick={() => void fetchOverview()}
                  className="px-2.5 py-1 rounded-lg border border-red-800 hover:bg-red-900/40 font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                >
                  {t("app.retry")}
                </button>
              </div>
            )}

            {s.isLoading && !data ? (
              <LoadingSkeleton label={t("app.loading")} />
            ) : !data ? (
              <div className="p-6 bg-red-950/30 border border-red-900 rounded-xl text-red-300 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <div className="flex-1">
                  <h3 className="font-semibold">{t("app.loadError.title")}</h3>
                  <p className="text-sm text-red-400/80">{t("app.loadError.body")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchOverview()}
                  className="px-3 py-1.5 rounded-lg border border-red-800 hover:bg-red-900/40 text-sm cursor-pointer"
                >
                  {t("app.retry")}
                </button>
              </div>
            ) : (
              <>
                {activeTab === "overview" && (
                  <OverviewTab
                    data={data}
                    powerData={s.powerData}
                    coolingData={s.coolingData}
                    freezeData={s.freezeData}
                    batteryReport={s.batteryReport}
                    driverReport={s.driverReport}
                    latencyResult={s.latencyResult}
                    cpuResult={s.cpuResult}
                    ramResult={s.ramResult}
                    diskResult={s.diskResult}
                    setActiveTab={setActiveTab}
                  />
                )}

                {activeTab === "live" && <LiveTab />}
                {activeTab === "processes" && <ProcessesTab />}

                {activeTab === "drivers" && (
                  <DriversTab driverReport={s.driverReport} isScanningDrivers={!!s.busy.drivers} scanDrivers={s.scanDrivers} />
                )}

                {activeTab === "latency" && (
                  <LatencyTab
                    latencyResult={s.latencyResult}
                    isTestingLatency={!!s.busy.latency}
                    latencyDuration={s.latencyDuration}
                    setLatencyDuration={s.setLatencyDuration}
                    runLatencyTest={s.runLatencyTest}
                  />
                )}

                {activeTab === "storage" && <StorageTab />}
                {activeTab === "history" && <HistoryTab />}

                {activeTab === "power" && (
                  <PowerTab
                    powerData={s.powerData}
                    batteryReport={s.batteryReport}
                    isTestingBattery={!!s.busy.battery}
                    runBatteryTest={s.runBatteryTest}
                    powerDeliveryReport={s.powerDeliveryReport}
                    isTestingPowerDelivery={!!s.busy.powerDelivery}
                    runPowerDeliveryCheck={s.runPowerDeliveryCheck}
                  />
                )}

                {activeTab === "cooling" && <CoolingTab coolingData={s.coolingData} />}

                {activeTab === "freeze" && (
                  <FreezeTab freezeData={s.freezeData} isScanningFreeze={!!s.busy.freeze} scanFreezeDiagnostic={s.scanFreezeDiagnostic} />
                )}

                {activeTab === "cpu" && (
                  <CpuTab
                    data={data}
                    isTestingCpu={!!s.busy.cpu}
                    cpuDuration={s.cpuDuration}
                    setCpuDuration={s.setCpuDuration}
                    handleCpuStress={() => void s.runCpuStress()}
                    cpuResult={s.cpuResult}
                  />
                )}

                {activeTab === "ram" && (
                  <RamTab
                    data={data}
                    isTestingRam={!!s.busy.ram}
                    ramSizeMb={s.ramSizeMb}
                    setRamSizeMb={s.setRamSizeMb}
                    handleRamStress={() => void s.runRamStress()}
                    ramResult={s.ramResult}
                  />
                )}

                {activeTab === "disk" && (
                  <DiskTab
                    data={data}
                    isTestingDisk={!!s.busy.disk}
                    diskSizeMb={s.diskSizeMb}
                    setDiskSizeMb={s.setDiskSizeMb}
                    handleDiskBenchmark={() => void s.runDiskBenchmark()}
                    diskResult={s.diskResult}
                  />
                )}

                {activeTab === "gpu" && <GpuTab />}
                {activeTab === "burnin" && <BurnInTab />}

                {activeTab === "keyboard" && (
                  <KeyboardTab isLaptop={s.powerData?.is_laptop ?? false} onUpdateResult={report.keyboard} />
                )}
                {activeTab === "screen" && <ScreenTab onUpdateResult={report.screen} />}
                {activeTab === "touchpad" && <TouchpadTab onUpdateResult={report.touchpad} />}
                {activeTab === "audio" && <AudioTab onUpdateResult={report.audio} />}
                {activeTab === "camera" && <CameraTab onUpdateResult={report.camera} />}
                {activeTab === "network" && <NetworkTab onUpdateResult={report.network} />}
              </>
            )}
          </main>
        </div>
      </div>

      <Footer connection={connection} />
      <Toaster />
      <CommandPalette />
    </div>
  );
}
