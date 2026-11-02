export type FormFactor = "laptop" | "tkl" | "full";
export type KeymapType = "qwerty" | "azerty" | "qwertz";
export type EnterStyle = "ansi" | "iso";

export interface KeyDef {
  code: string;
  label: string;
  width?: string;
  isSpecial?: boolean;
}

export interface KeyboardScanResult {
  formFactor: FormFactor;
  keymapType: KeymapType;
  enterStyle: EnterStyle;
  details: string;
}

// Function Row definitions
function getFunctionRow(formFactor: FormFactor): KeyDef[] {
  const base: KeyDef[] = [
    { code: "Escape", label: "ESC", width: "w-10 sm:w-11" },
    { code: "F1", label: "F1" },
    { code: "F2", label: "F2" },
    { code: "F3", label: "F3" },
    { code: "F4", label: "F4" },
    { code: "F5", label: "F5" },
    { code: "F6", label: "F6" },
    { code: "F7", label: "F7" },
    { code: "F8", label: "F8" },
    { code: "F9", label: "F9" },
    { code: "F10", label: "F10" },
    { code: "F11", label: "F11" },
    { code: "F12", label: "F12" },
  ];

  if (formFactor === "laptop") {
    base.push({ code: "Delete", label: "DEL", width: "w-10 sm:w-11" });
    return base;
  }

  // TKL & Full have navigation block headers
  base.push(
    { code: "PrintScreen", label: "PRT" },
    { code: "ScrollLock", label: "SCR" },
    { code: "Pause", label: "PAU" }
  );

  return base;
}

// Number Row definitions
function getNumberRow(keymap: KeymapType, formFactor: FormFactor): KeyDef[] {
  const digits =
    keymap === "azerty"
      ? ["& 1", "é 2", '" 3', "' 4", "( 5", "§ 6", "è 7", "! 8", "ç 9", "à 0"]
      : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  const row: KeyDef[] = [
    {
      code: "Backquote",
      label: keymap === "azerty" ? "²" : keymap === "qwertz" ? "^ °" : "` ~",
    },
    ...digits.map((label, idx) => ({
      code: `Digit${(idx + 1) % 10}`,
      label,
    })),
    {
      code: "Minus",
      label: keymap === "qwertz" ? "ß ?" : "- _",
    },
    {
      code: "Equal",
      label: keymap === "qwertz" ? "´ `" : "= +",
    },
    { code: "Backspace", label: "Backspace", width: "w-16 sm:w-20" },
  ];

  if (formFactor === "full" || formFactor === "tkl") {
    row.push(
      { code: "Insert", label: "INS" },
      { code: "Delete", label: "DEL" }
    );
  }

  return row;
}

// QWERTY / AZERTY / QWERTZ Row 2
function getAlphaRow1(
  keymap: KeymapType,
  enterStyle: EnterStyle,
  formFactor: FormFactor
): KeyDef[] {
  const labels =
    keymap === "azerty"
      ? ["A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P", "^ ¨", "$ *"]
      : keymap === "qwertz"
      ? ["Q", "W", "E", "R", "T", "Z", "U", "I", "O", "P", "Ü", "+ *"]
      : ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[ {", "] }"];

  const codes = [
    "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY",
    "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight",
  ];

  const row: KeyDef[] = [
    { code: "Tab", label: "Tab", width: "w-12 sm:w-14" },
    ...codes.map((code, idx) => ({ code, label: labels[idx] })),
  ];

  // ANSI has backslash on alpha row 1
  if (enterStyle === "ansi") {
    row.push({ code: "Backslash", label: "\\ |", width: "w-12 sm:w-14" });
  }

  if (formFactor === "laptop") {
    row.push({ code: "Home", label: "HOME" });
  } else {
    row.push(
      { code: "Home", label: "HOME" },
      { code: "PageUp", label: "PGUP" }
    );
  }

  return row;
}

// Home Row / Alpha Row 2
function getAlphaRow2(
  keymap: KeymapType,
  enterStyle: EnterStyle,
  formFactor: FormFactor
): KeyDef[] {
  const labels =
    keymap === "azerty"
      ? ["Q", "S", "D", "F", "G", "H", "J", "K", "L", "M", "ù %", "µ *"]
      : keymap === "qwertz"
      ? ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ö", "Ä", "# '"]
      : ["A", "S", "D", "F", "G", "H", "J", "K", "L", "; :", "' \""];

  const codes = [
    "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH",
    "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote",
  ];

  if (keymap === "azerty" || keymap === "qwertz") {
    codes.push("Backslash");
  }

  const row: KeyDef[] = [
    { code: "CapsLock", label: "Caps Lock", width: "w-14 sm:w-16" },
    ...codes.map((code, idx) => ({ code, label: labels[idx] })),
    {
      code: "Enter",
      label: "Enter",
      width: enterStyle === "iso" ? "w-16 sm:w-20" : "w-18 sm:w-22",
    },
  ];

  if (formFactor === "laptop") {
    row.push({ code: "PageUp", label: "PGUP" });
  } else {
    row.push(
      { code: "End", label: "END" },
      { code: "PageDown", label: "PGDN" }
    );
  }

  return row;
}

// Bottom Alpha Row 3
function getAlphaRow3(
  keymap: KeymapType,
  enterStyle: EnterStyle,
  formFactor: FormFactor
): KeyDef[] {
  const labels =
    keymap === "azerty"
      ? ["W", "X", "C", "V", "B", "N", ", ?", "; .", ": /", "= +"]
      : keymap === "qwertz"
      ? ["Y", "X", "C", "V", "B", "N", "M", ", ;", ". :", "- _"]
      : ["Z", "X", "C", "V", "B", "N", "M", ", <", ". >", "/ ?"];

  const codes = [
    "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN",
    "KeyM", "Comma", "Period", "Slash",
  ];

  const row: KeyDef[] = [];

  if (enterStyle === "iso") {
    row.push({ code: "ShiftLeft", label: "Shift", width: "w-11 sm:w-12" });
    row.push({ code: "IntlBackslash", label: "< >", width: "w-9 sm:w-10" });
  } else {
    row.push({ code: "ShiftLeft", label: "Shift", width: "w-16 sm:w-20" });
  }

  codes.forEach((code, idx) => {
    row.push({ code, label: labels[idx] });
  });

  row.push({ code: "ShiftRight", label: "Shift", width: "w-18 sm:w-22" });

  if (formFactor === "laptop") {
    row.push({ code: "PageDown", label: "PGDN" });
  } else {
    row.push({ code: "ArrowUp", label: "▲" });
  }

  return row;
}

// Spacebar / Bottom Row
function getBottomRow(formFactor: FormFactor): KeyDef[] {
  const row: KeyDef[] = [
    { code: "ControlLeft", label: "Ctrl", width: "w-11 sm:w-12" },
    { code: "MetaLeft", label: "Win", width: "w-10 sm:w-11" },
    { code: "AltLeft", label: "Alt", width: "w-11 sm:w-12" },
    { code: "Space", label: "Spatiebalk", width: "flex-1 max-w-xs sm:max-w-sm" },
    { code: "AltRight", label: "AltGr", width: "w-11 sm:w-12" },
    { code: "ContextMenu", label: "Menu", width: "w-10 sm:w-11" },
    { code: "ControlRight", label: "Ctrl", width: "w-11 sm:w-12" },
  ];

  if (formFactor === "laptop") {
    row.push({ code: "End", label: "END" });
    row.push({ code: "ArrowLeft", label: "◀" });
    row.push({ code: "ArrowUp", label: "▲" });
    row.push({ code: "ArrowDown", label: "▼" });
    row.push({ code: "ArrowRight", label: "▶" });
  } else {
    row.push(
      { code: "ArrowLeft", label: "◀" },
      { code: "ArrowDown", label: "▼" },
      { code: "ArrowRight", label: "▶" }
    );
  }

  return row;
}

// 17-Key Numpad Definition (Full format)
export const NUMPAD_ROWS: KeyDef[][] = [
  [
    { code: "NumLock", label: "Num", width: "w-9 sm:w-10" },
    { code: "NumpadDivide", label: "/", width: "w-9 sm:w-10" },
    { code: "NumpadMultiply", label: "*", width: "w-9 sm:w-10" },
    { code: "NumpadSubtract", label: "-", width: "w-9 sm:w-10" },
  ],
  [
    { code: "Numpad7", label: "7", width: "w-9 sm:w-10" },
    { code: "Numpad8", label: "8", width: "w-9 sm:w-10" },
    { code: "Numpad9", label: "9", width: "w-9 sm:w-10" },
    { code: "NumpadAdd", label: "+", width: "w-9 sm:w-10" },
  ],
  [
    { code: "Numpad4", label: "4", width: "w-9 sm:w-10" },
    { code: "Numpad5", label: "5", width: "w-9 sm:w-10" },
    { code: "Numpad6", label: "6", width: "w-9 sm:w-10" },
    { code: "NumpadEqual", label: "=", width: "w-9 sm:w-10" },
  ],
  [
    { code: "Numpad1", label: "1", width: "w-9 sm:w-10" },
    { code: "Numpad2", label: "2", width: "w-9 sm:w-10" },
    { code: "Numpad3", label: "3", width: "w-9 sm:w-10" },
    { code: "NumpadEnter", label: "Ent", width: "w-9 sm:w-10" },
  ],
  [
    { code: "Numpad0", label: "0", width: "w-18 sm:w-20" },
    { code: "NumpadDecimal", label: ",", width: "w-9 sm:w-10" },
  ],
];

// Generates the active keyboard rows
export function generateKeyboardRows(
  formFactor: FormFactor,
  keymap: KeymapType,
  enterStyle: EnterStyle
): KeyDef[][] {
  return [
    getFunctionRow(formFactor),
    getNumberRow(keymap, formFactor),
    getAlphaRow1(keymap, enterStyle, formFactor),
    getAlphaRow2(keymap, enterStyle, formFactor),
    getAlphaRow3(keymap, enterStyle, formFactor),
    getBottomRow(formFactor),
  ];
}

// Scans keyboard layout using hardware hints & browser Keyboard Layout Map API
export async function scanKeyboardLayout(
  isLaptop: boolean
): Promise<KeyboardScanResult> {
  let formFactor: FormFactor = isLaptop ? "laptop" : "full";
  let keymapType: KeymapType = "qwerty";
  let enterStyle: EnterStyle = "ansi";
  let scanSource = "Standaard detectie (Systeem & Chassis)";

  // 1. Check navigator.keyboard getLayoutMap API if available
  const navAny = navigator as unknown as {
    keyboard?: {
      getLayoutMap?: () => Promise<{ get: (key: string) => string | undefined }>;
    };
  };

  if (navAny.keyboard?.getLayoutMap) {
    try {
      const map = await navAny.keyboard.getLayoutMap();
      const qChar = map.get("KeyQ")?.toLowerCase();
      const zChar = map.get("KeyZ")?.toLowerCase();

      if (qChar === "a") {
        keymapType = "azerty";
        enterStyle = "iso";
        scanSource = "Live Keyboard Layout Map API (AZERTY herkent)";
      } else if (zChar === "y") {
        keymapType = "qwertz";
        enterStyle = "iso";
        scanSource = "Live Keyboard Layout Map API (QWERTZ herkent)";
      } else {
        keymapType = "qwerty";
        scanSource = "Live Keyboard Layout Map API (QWERTY herkent)";
      }
    } catch {
      // Permission blocked or fallback
    }
  }

  // 2. Language/Locale heuristics if not resolved
  if (scanSource.startsWith("Standaard")) {
    const lang = (navigator.language || "").toLowerCase();
    if (lang.includes("be") || lang.includes("fr")) {
      keymapType = "azerty";
      enterStyle = "iso";
      scanSource = `Taalcode locale (${lang}) -> AZERTY`;
    } else if (lang.includes("de") || lang.includes("at") || lang.includes("ch")) {
      keymapType = "qwertz";
      enterStyle = "iso";
      scanSource = `Taalcode locale (${lang}) -> QWERTZ`;
    } else if (lang.includes("nl") || lang.includes("gb")) {
      keymapType = "qwerty";
      // NL/UK usually ISO Enter on laptops, ANSI or ISO on desktops
      enterStyle = isLaptop ? "iso" : "ansi";
      scanSource = `Systeem locale (${lang}) + ${isLaptop ? "Laptop chassis" : "Desktop"}`;
    }
  }

  const formFactorLabel =
    formFactor === "laptop"
      ? "Laptop 75% compact"
      : "100% Volledig met Numpad";

  const details = `${scanSource} • ${formFactorLabel} • ${keymapType.toUpperCase()} • ${enterStyle.toUpperCase()} Enter`;

  return { formFactor, keymapType, enterStyle, details };
}
