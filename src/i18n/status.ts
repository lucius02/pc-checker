import { useI18nStore, type Lang } from "./index";

/**
 * De backend geeft statuscodes altijd in het Nederlands terug (de frontend vergelijkt erop).
 * Deze tabel vertaalt ze alleen voor weergave. Onbekende waarden worden ongewijzigd getoond.
 */
const STATUS_EN: Record<string, string> = {
  // Gezondheid / algemene oordelen
  Goed: "Good",
  "Let op": "Attention",
  Kritiek: "Critical",
  "Niet getest": "Not tested",
  Matig: "Fair",
  Slecht: "Poor",
  Uitstekend: "Excellent",
  Redelijk: "Reasonable",
  "Aandacht nodig": "Needs attention",
  // Freeze-risico
  Hoog: "High",
  Middel: "Medium",
  Laag: "Low",
  // Drivers
  OK: "OK",
  Verouderd: "Outdated",
  Probleem: "Problem",
  "Niet ondertekend": "Unsigned",
  // Opslag / overig
  Onbekend: "Unknown",
  Voldoende: "Sufficient",
  Onvoldoende: "Insufficient",
  Waarschuwing: "Warning",
  Fout: "Error",
  "Desktop PC": "Desktop PC",
  "Uitmuntend (Graad A)": "Excellent (grade A)",
  "Goed (Graad B)": "Good (grade B)",
  "Matig (Graad C)": "Fair (grade C)",
  "Versleten (Graad D)": "Worn (grade D)",
};

export function statusLabel(lang: Lang, code: string): string {
  return lang === "en" ? (STATUS_EN[code] ?? code) : code;
}

/** React-hook: `const status = useStatusLabel(); status(report.verdict)`. */
export function useStatusLabel() {
  const lang = useI18nStore((s) => s.lang);
  return (code: string) => statusLabel(lang, code);
}
