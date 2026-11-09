import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { Bot } from "lucide-react";
import type { Bid } from "@/lib/types";
import { money, timeAgo } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

export function BidHistory({ bids, currency }: { bids: Bid[]; currency: string }) {
  const { user } = useAuth();
  const [, force] = useState(0);
  // Refresh relative timestamps.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  if (bids.length === 0) {
    return <p className="py-6 text-sm text-ink-muted">No bids yet. Be the first to bid.</p>;
  }
  const sorted = [...bids].sort((a, b) => b.amount - a.amount);

  return (
    <ol className="divide-y divide-ink/5">
      <AnimatePresence initial={false}>
        {sorted.map((b, i) => {
          const mine = user?.id === b.bidderId;
          return (
            <motion.li
              key={b.id}
              layout
              initial={{ opacity: 0, backgroundColor: "rgba(168,131,62,0.25)" }}
              animate={{ opacity: 1, backgroundColor: "rgba(168,131,62,0)" }}
              transition={{ duration: 1.2 }}
              className="flex items-center justify-between gap-3 px-1 py-2.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className={clsx("inline-flex min-w-[4.5rem] justify-center px-2 py-0.5 text-xs", mine ? "bg-ink text-paper" : "bg-paper-deep text-ink-soft")}>
                  {mine ? "You" : `#${b.paddle}`}
                </span>
                {b.isProxy && <span title="Placed automatically from a maximum bid"><Bot className="h-3.5 w-3.5 text-ink-muted" /></span>}
                {i === 0 && <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">Top</span>}
              </span>
              <span className="flex items-baseline gap-3">
                <span className={clsx("tabular-nums", i === 0 && "font-semibold")}>{money(b.amount, currency)}</span>
                <span className="w-16 text-right text-xs text-ink-muted">{timeAgo(b.createdAt)}</span>
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
