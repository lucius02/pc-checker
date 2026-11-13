import React, { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "../utils/cn";

export interface Toast {
  id: number;
  kind: "error" | "success";
  message: string;
}

const TOAST_LIFETIME_MS = 6000;

/** Beheert tijdelijke meldingen die automatisch verdwijnen. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (kind: Toast["kind"], message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS);
    },
    [dismissToast]
  );

  return { toasts, pushToast, dismissToast };
}

interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export const Toasts: React.FC<ToastsProps> = ({ toasts, onDismiss }) => (
  <div
    className="fixed bottom-12 right-4 z-40 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
    role="status"
    aria-live="polite"
  >
    {toasts.map((toast) => (
      <div
        key={toast.id}
        className={cn(
          "animate-in fade-in flex items-start gap-2.5 p-3 rounded-xl border text-xs shadow-xl shadow-black/40 backdrop-blur-md",
          toast.kind === "error"
            ? "bg-red-950/90 border-red-800 text-red-200"
            : "bg-emerald-950/90 border-emerald-800 text-emerald-200"
        )}
      >
        {toast.kind === "error" ? (
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
        )}
        <p className="flex-1 leading-relaxed break-words">{toast.message}</p>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Melding sluiten"
          className="shrink-0 p-0.5 rounded opacity-70 hover:opacity-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-current"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    ))}
  </div>
);
