import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StressTestResult } from "../types";

interface UseHardwareTestsProps {
  onTestComplete?: () => void;
}

/**
 * Custom hook voor het beheren en uitvoeren van synthetische
 * CPU stresstests, RAM geheugentests en Disk benchmarks.
 */
export function useHardwareTests({ onTestComplete }: UseHardwareTestsProps = {}) {
  // CPU Stresstest state
  const [isTestingCpu, setIsTestingCpu] = useState(false);
  const [cpuDuration, setCpuDuration] = useState(5);
  const [cpuResult, setCpuResult] = useState<StressTestResult | null>(null);

  // RAM Geheugentest state
  const [isTestingRam, setIsTestingRam] = useState(false);
  const [ramSizeMb, setRamSizeMb] = useState(256);
  const [ramResult, setRamResult] = useState<StressTestResult | null>(null);

  // Schijf Benchmark state
  const [isTestingDisk, setIsTestingDisk] = useState(false);
  const [diskSizeMb, setDiskSizeMb] = useState(64);
  const [diskResult, setDiskResult] = useState<StressTestResult | null>(null);

  const handleCpuStress = useCallback(async () => {
    setIsTestingCpu(true);
    setCpuResult(null);
    try {
      const res = await invoke<StressTestResult>("run_cpu_stress_test", {
        durationSecs: cpuDuration,
        threadCount: null,
      });
      setCpuResult(res);
    } catch (err: unknown) {
      setCpuResult({
        success: false,
        test_name: "CPU Stress Test",
        duration_ms: 0,
        operations_or_bytes: 0,
        score_or_speed: 0,
        unit: "MOps/s",
        details: "Test mislukt.",
        error: String(err),
      });
    } finally {
      setIsTestingCpu(false);
      onTestComplete?.();
    }
  }, [cpuDuration, onTestComplete]);

  const handleRamStress = useCallback(async () => {
    setIsTestingRam(true);
    setRamResult(null);
    try {
      const res = await invoke<StressTestResult>("run_ram_stress_test", {
        sizeMb: ramSizeMb,
        passes: 1,
      });
      setRamResult(res);
    } catch (err: unknown) {
      setRamResult({
        success: false,
        test_name: "RAM Geheugentest",
        duration_ms: 0,
        operations_or_bytes: 0,
        score_or_speed: 0,
        unit: "MB/s",
        details: "Test mislukt.",
        error: String(err),
      });
    } finally {
      setIsTestingRam(false);
      onTestComplete?.();
    }
  }, [ramSizeMb, onTestComplete]);

  const handleDiskBenchmark = useCallback(async () => {
    setIsTestingDisk(true);
    setDiskResult(null);
    try {
      const res = await invoke<StressTestResult>("run_disk_benchmark", {
        targetDir: null,
        fileSizeMb: diskSizeMb,
      });
      setDiskResult(res);
    } catch (err: unknown) {
      setDiskResult({
        success: false,
        test_name: "Schijf Benchmark",
        duration_ms: 0,
        operations_or_bytes: 0,
        score_or_speed: 0,
        unit: "MB/s",
        details: "Test mislukt.",
        error: String(err),
      });
    } finally {
      setIsTestingDisk(false);
      onTestComplete?.();
    }
  }, [diskSizeMb, onTestComplete]);

  return {
    // CPU
    isTestingCpu,
    cpuDuration,
    setCpuDuration,
    cpuResult,
    handleCpuStress,
    // RAM
    isTestingRam,
    ramSizeMb,
    setRamSizeMb,
    ramResult,
    handleRamStress,
    // Disk
    isTestingDisk,
    diskSizeMb,
    setDiskSizeMb,
    diskResult,
    handleDiskBenchmark,
  };
}
