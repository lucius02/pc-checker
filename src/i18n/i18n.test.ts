import { describe, expect, it } from "vitest";
import { dictionaries, interpolate, translate } from "./index";

describe("i18n", () => {
  it("every language has exactly the same keys as Dutch", () => {
    const nlKeys = Object.keys(dictionaries.nl).sort();
    for (const [lang, dict] of Object.entries(dictionaries)) {
      expect(Object.keys(dict).sort(), lang).toEqual(nlKeys);
    }
  });

  it("no translation is empty", () => {
    for (const dict of Object.values(dictionaries)) {
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), k).not.toBe("");
    }
  });

  it("translates and interpolates", () => {
    expect(translate("en", "nav.overview")).toBe("System Overview");
    expect(translate("nl", "nav.overview")).toBe("Systeem Overzicht");
    expect(interpolate("{n} van {m}", { n: 1, m: 3 })).toBe("1 van 3");
    expect(interpolate("{onbekend}", { n: 1 })).toBe("{onbekend}");
  });
});
