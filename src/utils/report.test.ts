import { describe, expect, it } from "vitest";
import { buildHtmlReport, buildJsonReport, escapeHtml, reportFileName, type ReportSnapshot } from "./report";

const empty: ReportSnapshot = {
  data: null,
  powerData: null,
  coolingData: null,
  freezeData: null,
  batteryReport: null,
  powerDeliveryReport: null,
  driverReport: null,
  latencyResult: null,
  storageReport: null,
  history: null,
  healthScore: null,
  cpuResult: null,
  ramResult: null,
  diskResult: null,
  gpuResult: null,
  peripherals: {},
};

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;",
    );
    expect(escapeHtml(null)).toBe("");
  });
});

describe("buildHtmlReport", () => {
  it("produces a standalone document even with no data", () => {
    const html = buildHtmlReport(empty, "en", new Date(2026, 10, 5, 12, 0));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("PC Checker diagnostic report");
    expect(html).toContain("Not run");
    expect(html).not.toMatch(/<script|https?:\/\//);
  });

  it("escapes values coming from the system (no HTML injection via driver/disk names)", () => {
    const html = buildHtmlReport(
      {
        ...empty,
        storageReport: {
          is_available: true,
          scanned_at: "",
          is_elevated: false,
          warning_count: 0,
          critical_count: 1,
          summary: "1 kritiek",
          disks: [
            {
              model: "<b>evil</b>",
              serial: "",
              media_type: "SSD",
              bus_type: "NVMe",
              size_bytes: 0,
              health_status: "Unhealthy",
              operational_status: "",
              temperature_celsius: 40,
              temperature_max_celsius: null,
              wear_percent: 95,
              power_on_hours: 100,
              read_errors_uncorrected: 0,
              write_errors_uncorrected: 0,
              read_errors_total: null,
              write_errors_total: null,
              verdict: "Kritiek",
              findings: ["slijtage"],
            },
          ],
        },
      },
      "nl",
    );
    expect(html).toContain("&lt;b&gt;evil&lt;/b&gt;");
    expect(html).not.toContain("<b>evil</b>");
    expect(html).toContain("badge bad");
    expect(html).toContain("slijtage 95%");
  });

  it("includes stress test results", () => {
    const html = buildHtmlReport(
      {
        ...empty,
        ramResult: {
          success: false,
          test_name: "RAM",
          duration_ms: 1,
          operations_or_bytes: 1,
          score_or_speed: 1234.5,
          unit: "MB/s",
          details: "3 bitflips",
          error: "x",
        },
      },
      "nl",
    );
    expect(html).toContain("FOUT");
    expect(html).toContain("1234.5 MB/s");
  });
});

describe("export helpers", () => {
  it("builds a sortable file name", () => {
    expect(reportFileName("html", new Date(2026, 0, 2, 3, 4))).toBe("pc-checker-rapport-20260102-0304.html");
  });

  it("json export is valid JSON with a timestamp", () => {
    const parsed = JSON.parse(buildJsonReport(empty, new Date("2026-11-05T00:00:00Z")));
    expect(parsed.exportTimestamp).toBe("2026-11-05T00:00:00.000Z");
    expect(parsed.peripherals).toEqual({});
  });
});
