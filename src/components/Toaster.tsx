import React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useToastStore, type ToastKind } from "../store/toastStore";
import { useT } from "../i18n";
import { cn } from "../utils/cn";

const STYLES: Record<ToastKind, { box: string; icon: React.ComponentType<{ className?: string }>; iconClass: string }> = {
  error: { box: "border-red-800/80 bg-red-950/90", icon: AlertTriangle, iconClass: "text-red-400" },
  success: { box: "border-emerald-800/80 bg-emerald-950/90", icon: CheckCircle2, iconClass: "text-emerald-400" },
  info: { box: "border-sky-800/80 bg-sky-950/90", icon: Info, iconClass: "text-sky-400" },
};

/** Meldingen rechtsonder; fouten van backend-aanroepen komen hier terecht. */
export const Toaster: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const t = useT();

  return (
    <div className="fixed bottom-12 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const style = STYLES[toast.kind];
        const Icon = style.icon;
        return (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm shadow-xl backdrop-blur", style.box)}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-100">{toast.title}</p>
              {toast.message && <p className="mt-0.5 break-words text-xs text-slate-300">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded p-0.5 text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-slate-300 cursor-pointer"
              aria-label={t("toast.dismiss")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
