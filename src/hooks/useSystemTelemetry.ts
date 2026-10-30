import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SystemOverview,
  PowerInfo,
  CoolingOverview,
  FreezeDiagnosticReport,
  BatteryHealthReport,
} from "../types";

/**
 * Custom hook voor het beheren van real-time systeeminformatie,
 * voedingsdata, koeling, freeze-diagnostiek en automatische polling.
 */
export function useSystemTelemetry() {
  const [data, setData] = useState<SystemOverview | null>(null);
  const [powerData, setPowerData] = useState<PowerInfo | null>(null);
  const [coolingData, setCoolingData] = useState<CoolingOverview | null>(null);
  const [freezeData, setFreezeData] = useState<FreezeDiagnosticReport | null>(null);
  const [batteryReport, setBatteryReport] = useState<BatteryHealthReport | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isScanningFreeze, setIsScanningFreeze] = useState(false);
  const [isTestingBattery, setIsTestingBattery] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
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

  const scanFreezeDiagnostic = useCallback(async () => {
    setIsScanningFreeze(true);
    try {
      const report = await invoke<FreezeDiagnosticReport>("scan_freeze_diagnostic");
      setFreezeData(report);
    } catch (err) {
      console.error("Fout bij uitvoeren freeze-diagnose:", err);
    } finally {
      setIsScanningFreeze(false);
    }
  }, []);

  const runBatteryTest = useCallback(async () => {
    setIsTestingBattery(true);
    try {
      const report = await invoke<BatteryHealthReport>("run_battery_health_check");
      setBatteryReport(report);
    } catch (err) {
      console.error("Fout bij uitvoeren batterijtest:", err);
    } finally {
      setIsTestingBattery(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    scanFreezeDiagnostic();

    if (!autoRefresh) return;
    const interval = setInterval(fetchOverview, 3000);
    return () => clearInterval(interval);
  }, [fetchOverview, scanFreezeDiagnostic, autoRefresh]);

  return {
    data,
    powerData,
    coolingData,
    freezeData,
    batteryReport,
    isLoading,
    isScanningFreeze,
    isTestingBattery,
    autoRefresh,
    setAutoRefresh,
    lastUpdated,
    fetchOverview,
    scanFreezeDiagnostic,
    runBatteryTest,
  };
}
