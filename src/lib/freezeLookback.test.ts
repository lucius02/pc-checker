import { describe, expect, it } from "vitest";
import { DEFAULT_FREEZE_LOOKBACK_DAYS, parseLookbackDays } from "./freezeLookback";

describe("parseLookbackDays", () => {
  it("keeps a valid choice", () => {
    expect(parseLookbackDays("30")).toBe(30);
    expect(parseLookbackDays("1")).toBe(1);
  });
  it("falls back to one week for missing or odd values", () => {
    expect(DEFAULT_FREEZE_LOOKBACK_DAYS).toBe(7);
    for (const raw of [null, "", "abc", "0", "12", "-7"]) expect(parseLookbackDays(raw)).toBe(7);
  });
});
