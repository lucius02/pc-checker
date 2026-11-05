import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import "./App.css";

import type { PeripheralTestResults, TabType } from "./types";
import { useDiagnosticsStore } from "./store/diagnosticsStore";
import { api } from "./lib/api";
import { useI18nStore, useT } from "./i18n";
import { Header } from "./components/Header";
import { Navigation } from "./components/Navigation";
import { Footer } from "./components/Footer";
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

export default function App() {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
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

  useEffect(() => {
    if (!autoRefresh || NO_POLL_TABS.includes(activeTab)) return;
    const id = window.setInterval(() => void fetchOverview(), POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchOverview, autoRefresh, activeTab]);

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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      <Header />
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} freezeData={s.freezeData} />
      <UpdateNotice />

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {s.isLoading && !data ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-sm">{t("app.loading")}</p>
          </div>
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

      <Footer />
      <Toaster />
    </div>
  );
}
