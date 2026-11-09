import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Gavel, Info, X } from "lucide-react";
import { Link } from "react-router-dom";
import clsx from "clsx";

type Tone = "success" | "error" | "info" | "outbid";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
  href?: string;
}

const Ctx = createContext<((t: Omit<Toast, "id">) => void) | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "outbid" ? 9000 : 5000);
    },
    [dismiss],
  );

  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info, outbid: Gavel };

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const I = Icon[t.tone];
            const content = (
              <div className="flex gap-3">
                <I className={clsx("mt-0.5 h-5 w-5 shrink-0", t.tone === "success" && "text-emerald-600", t.tone === "error" && "text-live", t.tone === "outbid" && "text-gold", t.tone === "info" && "text-ink-muted")} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{t.title}</p>
                  {t.body && <p className="mt-0.5 text-sm text-ink-muted">{t.body}</p>}
                </div>
              </div>
            );
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40 }}
                className={clsx("pointer-events-auto relative border bg-paper-card p-4 pr-9 shadow-lg", t.tone === "outbid" ? "border-gold" : "border-ink/10")}
              >
                {t.href ? <Link to={t.href} onClick={() => dismiss(t.id)}>{content}</Link> : content}
                <button onClick={() => dismiss(t.id)} className="absolute right-2 top-2 p-1 text-ink-muted hover:text-ink" aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}
