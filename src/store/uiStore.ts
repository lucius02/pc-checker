import { create } from "zustand";
import type { TabType } from "../types";

const SIDEBAR_STORAGE_KEY = "pc-checker.sidebar-collapsed";
const MAX_HISTORY = 30;

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

interface UiState {
  activeTab: TabType;
  /** Eerder bezochte tabbladen (voor Alt+← / muisknop terug). */
  backStack: TabType[];
  forwardStack: TabType[];
  sidebarCollapsed: boolean;
  paletteOpen: boolean;

  navigate: (tab: TabType) => void;
  goBack: () => void;
  goForward: () => void;
  toggleSidebar: () => void;
  setPaletteOpen: (open: boolean) => void;
}

/** Navigatie en vensterindeling; los van de meetgegevens zodat ook stores kunnen navigeren. */
export const useUiStore = create<UiState>((set) => ({
  activeTab: "overview",
  backStack: [],
  forwardStack: [],
  sidebarCollapsed: readSidebarCollapsed(),
  paletteOpen: false,

  navigate: (tab) =>
    set((s) =>
      s.activeTab === tab
        ? s
        : { activeTab: tab, backStack: [...s.backStack, s.activeTab].slice(-MAX_HISTORY), forwardStack: [] },
    ),
  goBack: () =>
    set((s) => {
      const prev = s.backStack[s.backStack.length - 1];
      if (!prev) return s;
      return { activeTab: prev, backStack: s.backStack.slice(0, -1), forwardStack: [...s.forwardStack, s.activeTab] };
    }),
  goForward: () =>
    set((s) => {
      const next = s.forwardStack[s.forwardStack.length - 1];
      if (!next) return s;
      return { activeTab: next, forwardStack: s.forwardStack.slice(0, -1), backStack: [...s.backStack, s.activeTab] };
    }),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Opslag niet beschikbaar: de voorkeur geldt alleen voor deze sessie.
      }
      return { sidebarCollapsed: next };
    }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
