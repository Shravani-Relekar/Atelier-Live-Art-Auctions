import clsx from "clsx";
import { useCountdown } from "@/hooks/useCountdown";

const pad = (n: number) => String(n).padStart(2, "0");

interface Props {
  to: string;
  variant?: "inline" | "blocks";
  className?: string;
  /** Shown once the countdown reaches zero (before the server confirms the close). */
  doneLabel?: string;
}

export function Countdown({ to, variant = "inline", className, doneLabel = "Closing…" }: Props) {
  const c = useCountdown(to);
  const urgent = !c.done && c.ms < 2 * 60 * 1000;

  if (c.done) return <span className={clsx("font-medium text-live", className)}>{doneLabel}</span>;

  if (variant === "blocks") {
    const parts = c.days > 0
      ? [[c.days, "Days"], [c.hours, "Hrs"], [c.minutes, "Min"], [c.seconds, "Sec"]]
      : [[c.hours, "Hrs"], [c.minutes, "Min"], [c.seconds, "Sec"]];
    return (
      <div className={clsx("flex gap-2", className)} role="timer" aria-live="off">
        {parts.map(([v, l]) => (
          <div key={l as string} className={clsx("min-w-[3.6rem] border px-2 py-2 text-center", urgent ? "border-live/40 bg-live/5" : "border-ink/10 bg-paper-card")}>
            <div className={clsx("font-display text-3xl tabular-nums leading-none", urgent && "text-live")}>{pad(v as number)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-widest2 text-ink-muted">{l}</div>
          </div>
        ))}
      </div>
    );
  }

  const text = c.days > 0 ? `${c.days}d ${c.hours}h ${pad(c.minutes)}m` : c.hours > 0 ? `${c.hours}h ${pad(c.minutes)}m ${pad(c.seconds)}s` : `${pad(c.minutes)}:${pad(c.seconds)}`;
  return (
    <span role="timer" className={clsx("tabular-nums", urgent && "font-semibold text-live", className)}>
      {text}
    </span>
  );
}
