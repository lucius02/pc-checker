/** Keuzes voor hoe ver de Freeze Detective terugkijkt in het Windows-logboek (in dagen). */
export const FREEZE_LOOKBACK_OPTIONS = [1, 7, 30, 90, 180] as const;

/** Standaard: één week. Oudere problemen zijn vaak al opgelost. */
export const DEFAULT_FREEZE_LOOKBACK_DAYS = 7;

export const LOOKBACK_KEY = "pcc.freeze.lookbackDays";

/** Een opgeslagen waarde terug naar een geldige keuze; anders de standaard. */
export const parseLookbackDays = (raw: string | null): number => {
  const n = Number(raw);
  return (FREEZE_LOOKBACK_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_FREEZE_LOOKBACK_DAYS;
};

export const readLookbackDays = (): number => {
  try {
    return parseLookbackDays(localStorage.getItem(LOOKBACK_KEY));
  } catch {
    return DEFAULT_FREEZE_LOOKBACK_DAYS;
  }
};
