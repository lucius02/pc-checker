import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, AlertTriangle } from "lucide-react";
import "./App.css";

import {
  SystemOverview,
  PowerInfo,
  CoolingOverview,
  FreezeDiagnosticReport,
  BatteryHealthReport,
  StressTestResult,
  DriverReport,
  LatencyTestResult,
  TabType,
} from "./types";
import { formatBytes, formatUptime } from "./utils/formatters";
import { useHardwareTests } from "./hooks/useHardwareTests";
import { Header } from "./components/Header";
import { Navigation } from "./components/Navigation";
import { Footer } from "./components/Footer";
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [data, setData] = useState<SystemOverview | null>(null);
  const [powerData, setPowerData] = useState<PowerInfo | null>(null);
  const [coolingData, setCoolingData] = useState<CoolingOverview | null>(null);
  const [freezeData, setFreezeData] = useState<FreezeDiagnosticReport | null>(null);
  const [batteryReport, setBatteryReport] = useState<BatteryHealthReport | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isScanningFreeze, setIsScanningFreeze] = useState(false);
  const [isTestingBattery, setIsTestingBattery] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [driverReport, setDriverReport] = useState<DriverReport | null>(null);
  const [isScanningDrivers, setIsScanningDrivers] = useState(false);

  const [latencyResult, setLatencyResult] = useState<LatencyTestResult | null>(null);
  const [isTestingLatency, setIsTestingLatency] = useState(false);
  const [latencyDuration, setLatencyDuration] = useState(10);

  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchOverview = useCallback(async () => {
    try {
      const [overviewRes, powerRes, coolingRes] = await Promise.all([
        invoke<SystemOverview>("get_system_overview"),
        invoke<PowerInfo>("get_power_and_battery_info"),
        invoke<CoolingOverview>("get_cooling_and_fan_info"),
      ]);
      setData(overviewRes);
      setPowerData(powerRes);
      setCoolingData(coolingRes);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Fout bij ophalen systeeminformatie:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const scanFreezeDiagnostic = async () => {
    setIsScanningFreeze(true);
    try {
      const report = await invoke<FreezeDiagnosticReport>("scan_freeze_diagnostic");
      setFreezeData(report);
    } catch (err) {
      console.error("Fout bij uitvoeren freeze-diagnose:", err);
    } finally {
      setIsScanningFreeze(false);
    }
  };

  const runBatteryTest = async () => {
    setIsTestingBattery(true);
    try {
      const report = await invoke<BatteryHealthReport>("run_battery_health_check");
      setBatteryReport(report);
    } catch (err) {
      console.error("Fout bij uitvoeren batterijtest:", err);
    } finally {
      setIsTestingBattery(false);
    }
  };

  const scanDrivers = async () => {
    setIsScanningDrivers(true);
    try {
      const report = await invoke<DriverReport>("scan_drivers");
      setDriverReport(report);
    } catch (err) {
      console.error("Fout bij uitvoeren driver-scan:", err);
    } finally {
      setIsScanningDrivers(false);
    }
  };

  const runLatencyTest = async () => {
    setIsTestingLatency(true);
    setLatencyResult(null);
    try {
      const res = await invoke<LatencyTestResult>("run_latency_test", {
        durationSecs: latencyDuration,
      });
      setLatencyResult(res);
    } catch (err) {
      console.error("Fout bij uitvoeren latency-test:", err);
    } finally {
      setIsTestingLatency(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    scanFreezeDiagnostic();

    if (!autoRefresh) return;
    const interval = setInterval(fetchOverview, 3000);
    return () => clearInterval(interval);
  }, [fetchOverview, autoRefresh]);

  const {
    isTestingCpu,
    cpuDuration,
    setCpuDuration,
    cpuResult,
    handleCpuStress,
    isTestingRam,
    ramSizeMb,
    setRamSizeMb,
    ramResult,
    handleRamStress,
    isTestingDisk,
    diskSizeMb,
    setDiskSizeMb,
    diskResult,
    handleDiskBenchmark,
  } = useHardwareTests({ onTestComplete: fetchOverview });

  const exportReport = () => {
    if (!data) return;
    const report = {
      exportTimestamp: new Date().toISOString(),
      system: {
        os: `${data.os_name} ${data.os_version}`,
        kernel: data.kernel_version,
        host: data.host_name,
        sessionUptime: `${formatUptime(data.session_uptime_secs)} (${data.session_started_at})`,
        kernelUptime: formatUptime(data.kernel_uptime_secs),
        machineType: powerData?.is_laptop ? "Laptop" : "Desktop Workstation",
      },
      power: powerData,
      batteryReport,
      cooling: coolingData,
      freezeDiagnostics: freezeData,
      drivers: driverReport,
      latency: latencyResult,
      motherboard: data.motherboard,
      gpus: data.gpus,
      cpu: {
        model: data.cpu.brand,
        cores: `${data.cpu.physical_cores} fysiek / ${data.cpu.logical_cores} logisch`,
        currentUsage: `${data.cpu.global_usage.toFixed(1)}%`,
      },
      ram: {
        total: formatBytes(data.ram.total_bytes),
        used: formatBytes(data.ram.used_bytes),
        free: formatBytes(data.ram.free_bytes),
      },
      disks: data.disks.map((d) => ({
        name: d.name,
        mount: d.mount_point,
        total: formatBytes(d.total_bytes),
        available: formatBytes(d.available_bytes),
        type: d.disk_type,
      })),
      testResults: {
        cpuTest: cpuResult,
        ramTest: ramResult,
        diskTest: diskResult,
      },
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pc-checker-diagnostic-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      <Header
        data={data}
        powerData={powerData}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        fetchOverview={fetchOverview}
        isLoading={isLoading}
        exportReport={exportReport}
      />

      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        freezeData={freezeData}
      />

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {isLoading && !data ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-sm">Hardware- en stroomgegevens uitlezen...</p>
          </div>
        ) : !data ? (
          <div className="p-6 bg-red-950/30 border border-red-900 rounded-xl text-red-300 flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <div>
              <h3 className="font-semibold">Kon hardware niet uitlezen</h3>
              <p className="text-sm text-red-400/80">
                Er is een fout opgetreden bij het communiceren met de Rust backend.
              </p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <OverviewTab
                data={data}
                powerData={powerData}
                coolingData={coolingData}
                freezeData={freezeData}
                batteryReport={batteryReport}
                driverReport={driverReport}
                latencyResult={latencyResult}
                cpuResult={cpuResult}
                ramResult={ramResult}
                diskResult={diskResult}
                setActiveTab={setActiveTab}
              />
            )}

            {activeTab === "live" && <LiveTab />}

            {activeTab === "processes" && <ProcessesTab />}

            {activeTab === "drivers" && (
              <DriversTab
                driverReport={driverReport}
                isScanningDrivers={isScanningDrivers}
                scanDrivers={scanDrivers}
              />
            )}

            {activeTab === "latency" && (
              <LatencyTab
                latencyResult={latencyResult}
                isTestingLatency={isTestingLatency}
                latencyDuration={latencyDuration}
                setLatencyDuration={setLatencyDuration}
                runLatencyTest={runLatencyTest}
              />
            )}

            {activeTab === "power" && (
              <PowerTab
                powerData={powerData}
                batteryReport={batteryReport}
                isTestingBattery={isTestingBattery}
                runBatteryTest={runBatteryTest}
              />
            )}

            {activeTab === "cooling" && (
              <CoolingTab coolingData={coolingData} />
            )}

            {activeTab === "freeze" && (
              <FreezeTab
                freezeData={freezeData}
                isScanningFreeze={isScanningFreeze}
                scanFreezeDiagnostic={scanFreezeDiagnostic}
              />
            )}

            {activeTab === "cpu" && (
              <CpuTab
                data={data}
                isTestingCpu={isTestingCpu}
                cpuDuration={cpuDuration}
                setCpuDuration={setCpuDuration}
                handleCpuStress={handleCpuStress}
                cpuResult={cpuResult}
              />
            )}

            {activeTab === "ram" && (
              <RamTab
                data={data}
                isTestingRam={isTestingRam}
                ramSizeMb={ramSizeMb}
                setRamSizeMb={setRamSizeMb}
                handleRamStress={handleRamStress}
                ramResult={ramResult}
              />
            )}

            {activeTab === "disk" && (
              <DiskTab
                data={data}
                isTestingDisk={isTestingDisk}
                diskSizeMb={diskSizeMb}
                setDiskSizeMb={setDiskSizeMb}
                handleDiskBenchmark={handleDiskBenchmark}
                diskResult={diskResult}
              />
            )}
          </>
        )}
      </main>

      <Footer data={data} lastUpdated={lastUpdated} />
    </div>
  );
}
