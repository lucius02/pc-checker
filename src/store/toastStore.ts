import { create } from "zustand";

export type ToastKind = "error" | "success" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Optionele knop in de melding, bijv. "Bekijk resultaat". */
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
export const AUTO_DISMISS_MS = 7000;
const MAX_TOASTS = 4;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    // Dezelfde melding niet stapelen (bijv. een polling-fout die elke 4 s terugkomt).
    const duplicate = get().toasts.some((x) => x.title === t.title && x.message === t.message);
    if (duplicate) return;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-MAX_TOASTS) }));
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Gemaksfunctie voor gebruik buiten React-componenten. */
export const toast = {
  error: (title: string, message?: string) => useToastStore.getState().push({ kind: "error", title, message }),
  success: (title: string, message?: string, action?: ToastAction) =>
    useToastStore.getState().push({ kind: "success", title, message, action }),
  info: (title: string, message?: string) => useToastStore.getState().push({ kind: "info", title, message }),
};
