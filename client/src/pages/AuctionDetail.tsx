import { useDeferredValue, useState } from "react";
import { useParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Auction, Lot } from "@/lib/types";
import { dateTime, moneyShort } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { LotCard, LotCardSkeleton } from "@/components/LotCard";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, ErrorState } from "@/components/common";
import { useAuctionSubscription } from "@/hooks/useRealtime";

const SORTS = [
  { v: "lot", l: "Lot number" },
  { v: "ending", l: "Closing soonest" },
  { v: "priceDesc", l: "Price: high to low" },
  { v: "priceAsc", l: "Price: low to high" },
  { v: "bids", l: "Most bids" },
];

export default function AuctionDetail() {
  const { slug } = useParams();
  const [sort, setSort] = useState("lot");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());

  const { data, isLoading, error } = useQuery({
    queryKey: ["auction", slug, sort, query],
    queryFn: () => api.get<{ auction: Auction; lots: Lot[] }>(`/auctions/${slug}?sort=${sort}${query ? `&q=${encodeURIComponent(query)}` : ""}`),
    placeholderData: keepPreviousData,
  });
  // One room per auction delivers every bid/close in the catalogue.
  useAuctionSubscription(data?.auction.id);

  if (error) return <ErrorState error={error} />;
  const a = data?.auction;
  const lots = data?.lots ?? [];
  const live = lots.filter((l) => l.status === "LIVE").length;
  const total = lots.reduce((s, l) => s + (l.status === "SOLD" ? l.currentBid ?? 0 : 0), 0);
  const nextClose = lots.filter((l) => l.status === "LIVE").sort((x, y) => +new Date(x.endsAt) - +new Date(y.endsAt))[0];

  return (
    <>
      <section className="border-b border-ink/10 bg-paper-card">
        <div className="container-x py-12">
          {a ? (
            <div className="grid gap-10 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="flex items-center gap-3"><StatusBadge status={a.status} /><span className="eyebrow">Online auction</span></div>
                <h1 className="mt-4 text-5xl md:text-6xl">{a.title}</h1>
                {a.subtitle && <p className="mt-2 font-display text-2xl italic text-ink-muted">{a.subtitle}</p>}
                {a.description && <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-soft">{a.description}</p>}
              </div>
              <dl className="grid grid-cols-2 gap-x-10 gap-y-5 self-end text-sm lg:min-w-[320px]">
                <div><dt className="eyebrow">Opens</dt><dd className="mt-1">{dateTime(a.startsAt)}</dd></div>
                <div><dt className="eyebrow">First lot closes</dt><dd className="mt-1">{dateTime(a.endsAt)}</dd></div>
                <div><dt className="eyebrow">Lots</dt><dd className="mt-1">{lots.length}{live ? ` · ${live} live` : ""}</dd></div>
                {a.status === "CLOSED" ? (
                  <div><dt className="eyebrow">Sale total</dt><dd className="mt-1 font-display text-2xl">{moneyShort(total, a.currency)}</dd></div>
                ) : a.status === "UPCOMING" ? (
                  <div><dt className="eyebrow">Opens in</dt><dd className="mt-1 font-medium"><Countdown to={a.startsAt} /></dd></div>
                ) : nextClose ? (
                  <div><dt className="eyebrow">Next lot closes</dt><dd className="mt-1 font-medium">Lot {nextClose.lotNumber} · <Countdown to={nextClose.endsAt} /></dd></div>
                ) : null}
              </dl>
            </div>
          ) : (
            <div className="h-40 animate-pulse bg-paper-deep" />
          )}
        </div>
      </section>

      <section className="container-x py-10">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input className="input pl-10" placeholder="Search artist or title" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search lots" />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <span className="text-ink-muted">Sort by</span>
            <select className="input w-auto py-2.5" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-14 md:grid-cols-3 xl:grid-cols-4">
          {isLoading && Array.from({ length: 8 }, (_, i) => <LotCardSkeleton key={i} />)}
          {lots.map((l) => <LotCard key={l.id} lot={l} currency={a?.currency} />)}
        </div>
        {!isLoading && lots.length === 0 && <EmptyState title="No lots found" body={query ? "Try a different search." : undefined} />}
      </section>
    </>
  );
}
