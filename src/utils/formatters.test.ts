import { describe, expect, it } from "vitest";
import { formatBytes, formatUptime } from "./formatters";

describe("formatBytes", () => {
  it("formats common sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(16 * 1024 ** 3)).toBe("16 GB");
  });

  it("never returns an undefined unit for edge values", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(0.5)).toBe("0.5 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(1024 ** 7)).toMatch(/PB$/);
  });
});

describe("formatUptime", () => {
  it("shows days only when needed", () => {
    expect(formatUptime(59)).toBe("0u 0m");
    expect(formatUptime(3 * 3600 + 25 * 60)).toBe("3u 25m");
    expect(formatUptime(2 * 86400 + 3600)).toBe("2d 1u 0m");
  });
});
