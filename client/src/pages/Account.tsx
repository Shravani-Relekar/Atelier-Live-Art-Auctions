import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import type { Lot, MyBidItem, Standing } from "@/lib/types";
import { money } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { ArtImage } from "@/components/ArtImage";
import { Countdown } from "@/components/Countdown";
import { LotCard } from "@/components/LotCard";
import { EmptyState, PageLoader } from "@/components/common";
import { useLotSubscriptions } from "@/hooks/useRealtime";

const STANDING: Record<Standing, { label: string; cls: string }> = {
  LEADING: { label: "Leading", cls: "bg-emerald-700 text-white" },
  OUTBID: { label: "Outbid", cls: "bg-live text-white" },
  WON: { label: "Won", cls: "bg-gold text-white" },
  LOST: { label: "Not won", cls: "bg-ink-muted/20 text-ink-soft" },
  RESERVE_NOT_MET: { label: "Reserve not met", cls: "bg-ink-muted/20 text-ink-soft" },
};

export default function Account() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"bids" | "won" | "watchlist">("bids");
  const bids = useQuery({ queryKey: ["me", "bids"], queryFn: () => api.get<{ items: MyBidItem[] }>("/me/bids") });
  const watch = useQuery({ queryKey: ["me", "watchlist"], queryFn: () => api.get<{ lots: Lot[] }>("/me/watchlist") });

  const items = bids.data?.items ?? [];
  // Standing is recomputed client-side so it stays correct as socket updates patch the lot.
  const withStanding = items.map((it) => ({ ...it, standing: liveStanding(it, user?.id) }));
  const active = withStanding.filter((i) => i.lot.status === "LIVE");
  const won = withStanding.filter((i) => i.standing === "WON");
  useLotSubscriptions([...active.map((i) => i.lot.id), ...(watch.data?.lots ?? []).filter((l) => l.status === "LIVE").map((l) => l.id)]);

  if (!user) return <PageLoader />;

  return (
    <div className="container-x py-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">My account</p>
          <h1 className="mt-2 text-5xl">{user.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">{user.email}</p>
        </div>
        <div className="border border-ink/10 bg-paper-card px-6 py-4 text-center">
          <p className="eyebrow">Paddle</p>
          <p className="font-display text-4xl">#{user.paddle}</p>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-4 sm:max-w-xl">
        <Stat label="Active bids" value={active.length} />
        <Stat label="Leading" value={active.filter((i) => i.standing === "LEADING").length} />
        <Stat label="Won" value={won.length} />
      </div>

      <div className="mt-12 flex gap-8 border-b border-ink/10" role="tablist">
        {([["bids", "My bids"], ["won", "Won lots"], ["watchlist", "Watchlist"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("-mb-px border-b-2 pb-3 text-sm uppercase tracking-[0.16em]", tab === k ? "border-gold" : "border-transparent text-ink-muted")}>{l}</button>
        ))}
      </div>

      <div className="mt-8">
        {tab !== "watchlist" ? (
          bids.isLoading ? <PageLoader /> : (
            (() => {
              const list = tab === "won" ? won : withStanding;
              if (list.length === 0) return <EmptyState title={tab === "won" ? "No won lots yet" : "You haven't bid yet"} action={<Link to="/auctions" className="btn-outline">Browse auctions</Link>} />;
              return (
                <div className="divide-y divide-ink/10 border-y border-ink/10">
                  {list.map((it) => <BidRow key={it.lot.id} item={it} />)}
                </div>
              );
            })()
          )
        ) : watch.isLoading ? <PageLoader /> : watch.data?.lots.length ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-3 xl:grid-cols-4">
            {watch.data.lots.map((l) => <LotCard key={l.id} lot={l} showAuction />)}
          </div>
        ) : (
          <EmptyState title="Your watchlist is empty" body="Tap “Watch” on any lot to follow it here." />
        )}
      </div>
    </div>
  );
}

function liveStanding(it: MyBidItem, userId?: string): Standing {
  const l = it.lot;
  const leading = l.highestBidderId === userId;
  if (l.status === "LIVE" || l.status === "UPCOMING") return leading ? "LEADING" : "OUTBID";
  if (l.status === "SOLD") return leading ? "WON" : "LOST";
  return leading ? "RESERVE_NOT_MET" : "LOST";
}

function BidRow({ item }: { item: MyBidItem }) {
  const { lot } = item;
  const currency = lot.auction?.currency ?? "INR";
  const s = STANDING[item.standing];
  return (
    <Link to={`/lots/${lot.id}`} className="grid grid-cols-[72px_1fr] items-center gap-5 py-5 sm:grid-cols-[96px_1fr_auto_auto] hover:bg-paper-card">
      <ArtImage image={lot.images?.[0]} width={200} fit="cover" className="aspect-square" />
      <div className="min-w-0">
        <p className="eyebrow">Lot {lot.lotNumber} · {lot.auction?.title}</p>
        <p className="mt-1 truncate font-display text-xl">{lot.artist?.name}</p>
        <p className="truncate text-sm italic text-ink-muted">{lot.title}</p>
      </div>
      <div className="col-span-2 flex gap-8 text-sm sm:col-span-1">
        <div><p className="eyebrow">Your top bid</p><p className="mt-1 tabular-nums">{money(item.myTopBid, currency)}</p></div>
        <div><p className="eyebrow">{lot.status === "LIVE" ? "Current" : "Final"}</p><p className="mt-1 font-semibold tabular-nums">{money(lot.currentBid, currency)}</p></div>
        {lot.status === "LIVE" && <div><p className="eyebrow">Closes</p><p className="mt-1"><Countdown to={lot.endsAt} /></p></div>}
      </div>
      <span className={clsx("col-span-2 justify-self-start px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] sm:col-span-1 sm:justify-self-end", s.cls)}>{s.label}</span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-ink/10 bg-paper-card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
    </div>
  );
}
