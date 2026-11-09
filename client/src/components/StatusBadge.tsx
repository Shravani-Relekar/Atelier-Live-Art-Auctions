import clsx from "clsx";
import type { AuctionStatus, LotStatus } from "@/lib/types";

const styles: Record<string, string> = {
  LIVE: "bg-live text-white",
  UPCOMING: "bg-ink text-paper",
  SOLD: "bg-gold text-white",
  PASSED: "bg-ink-muted/20 text-ink-soft",
  CLOSED: "bg-ink-muted/20 text-ink-soft",
  WITHDRAWN: "bg-ink-muted/20 text-ink-soft",
  DRAFT: "border border-dashed border-ink/30 text-ink-muted",
};
const labels: Record<string, string> = { PASSED: "Unsold", LIVE: "Live" };

export function StatusBadge({ status, className }: { status: LotStatus | AuctionStatus; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]", styles[status], className)}>
      {status === "LIVE" && <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-white" />}
      {labels[status] ?? status.toLowerCase()}
    </span>
  );
}
