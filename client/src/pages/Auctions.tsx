import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { AuctionSummary } from "@/lib/types";
import { EmptyState } from "@/components/common";
import { AuctionFeature } from "./Home";

const TABS = [
  { key: "current", label: "Current", status: "LIVE" },
  { key: "upcoming", label: "Upcoming", status: "UPCOMING" },
  { key: "past", label: "Past", status: "CLOSED" },
] as const;

export default function Auctions() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get("tab")) ?? TABS[0];
  const { data, isLoading } = useQuery({
    queryKey: ["auctions", tab.status],
    queryFn: () => api.get<{ auctions: AuctionSummary[] }>(`/auctions?status=${tab.status}&limit=50`),
  });

  return (
    <div className="container-x py-14">
      <p className="eyebrow">Auctions</p>
      <h1 className="mt-2 text-5xl md:text-6xl">{tab.label} auctions</h1>
      <div className="mt-8 flex gap-8 border-b border-ink/10" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={t.key === tab.key}
            onClick={() => setParams(t.key === "current" ? {} : { tab: t.key })}
            className={clsx("-mb-px border-b-2 pb-3 text-sm uppercase tracking-[0.16em] transition", t.key === tab.key ? "border-gold text-ink" : "border-transparent text-ink-muted hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-12 grid gap-x-8 gap-y-16 md:grid-cols-2">
        {isLoading && [0, 1].map((i) => <div key={i} className="aspect-[16/10] animate-pulse bg-paper-deep" />)}
        {data?.auctions.map((a) => <AuctionFeature key={a.id} auction={a} />)}
      </div>
      {data?.auctions.length === 0 && (
        <EmptyState
          title={`No ${tab.label.toLowerCase()} auctions`}
          body={tab.key === "current" ? "Take a look at what's coming up next." : undefined}
          action={tab.key === "current" ? <Link to="/auctions?tab=upcoming" className="btn-outline">Upcoming auctions</Link> : undefined}
        />
      )}
    </div>
  );
}
