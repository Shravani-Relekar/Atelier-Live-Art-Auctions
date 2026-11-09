import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { api } from "@/lib/api";
import type { LotDetailResponse } from "@/lib/types";
import { estimate, lifespan } from "@/lib/format";
import { seedClockOffset } from "@/lib/socket";
import { ArtImage } from "@/components/ArtImage";
import { BidPanel } from "@/components/BidPanel";
import { BidHistory } from "@/components/BidHistory";
import { StatusBadge } from "@/components/StatusBadge";
import { ZoomViewer } from "@/components/ZoomViewer";
import { ErrorState, PageLoader } from "@/components/common";
import { useLotSubscriptions } from "@/hooks/useRealtime";

export default function LotDetail() {
  const { id } = useParams();
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [tab, setTab] = useState<"details" | "history">("details");

  const { data, isLoading, error } = useQuery({
    queryKey: ["lot", id],
    queryFn: async () => {
      const d = await api.get<LotDetailResponse>(`/lots/${id}`);
      seedClockOffset(d.serverTime);
      return d;
    },
  });
  useLotSubscriptions([id]);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} />;

  const { lot, bids, viewer } = data;
  const currency = lot.auction?.currency ?? "INR";
  const images = lot.images ?? [];
  const img = images[active];

  return (
    <div className="container-x py-8">
      {/* Breadcrumb & lot navigation */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <nav className="text-ink-muted" aria-label="Breadcrumb">
          <Link to="/auctions" className="hover:text-ink">Auctions</Link>
          <span className="mx-2">/</span>
          {lot.auction && <Link to={`/auctions/${lot.auction.slug}`} className="hover:text-ink">{lot.auction.title}</Link>}
          <span className="mx-2">/</span>
          <span className="text-ink">Lot {lot.lotNumber}</span>
        </nav>
        <div className="flex items-center gap-1">
          <NavBtn to={data.prevLotId} label="Previous lot"><ChevronLeft className="h-4 w-4" /> Prev</NavBtn>
          <NavBtn to={data.nextLotId} label="Next lot">Next <ChevronRight className="h-4 w-4" /></NavBtn>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] xl:gap-16">
        {/* Gallery */}
        <div>
          <button
            onClick={() => img && setZoom(true)}
            className="group relative block aspect-[5/4] w-full bg-paper-deep p-6 md:p-10"
            aria-label="Open high-resolution viewer"
          >
            <ArtImage image={img} alt={`${lot.title} by ${lot.artist?.name}`} width={1600} priority sizes="(min-width:1024px) 58vw, 100vw" className="h-full w-full bg-transparent" imgClassName="drop-shadow-[0_18px_30px_rgba(20,18,16,0.3)]" />
            <span className="absolute bottom-4 right-4 flex items-center gap-2 bg-ink/80 px-3 py-2 text-xs uppercase tracking-[0.16em] text-paper opacity-90 transition group-hover:opacity-100">
              <ZoomIn className="h-4 w-4" /> Inspect in detail
            </span>
          </button>
          {images.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto no-scrollbar">
              {images.map((im, i) => (
                <button key={im.id ?? i} onClick={() => setActive(i)} className={clsx("h-20 w-20 shrink-0 border-2 p-1", i === active ? "border-gold" : "border-transparent")}>
                  <ArtImage image={im} width={160} fit="cover" className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Summary + bidding */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-center gap-3">
            <StatusBadge status={lot.status} />
            <span className="eyebrow">Lot {lot.lotNumber}</span>
          </div>
          <h1 className="mt-4 text-4xl md:text-5xl">
            {lot.artist ? <Link to={`/artists/${lot.artist.slug}`} className="hover:text-gold-dark">{lot.artist.name}</Link> : null}
          </h1>
          {lot.artist && <p className="text-sm text-ink-muted">{lot.artist.country} · {lifespan(lot.artist.born, lot.artist.died)}</p>}
          <p className="mt-3 font-display text-2xl italic">{lot.title}{lot.year ? `, ${lot.year}` : ""}</p>
          <p className="mt-4 text-sm"><span className="text-ink-muted">Estimate </span><span className="font-medium">{estimate(lot.estimateLow, lot.estimateHigh, currency)}</span></p>
          <div className="mt-6">
            <BidPanel lot={lot} bids={bids} viewer={viewer} />
          </div>
        </div>
      </div>

      {/* Details / history */}
      <div className="mt-16 grid gap-10 lg:grid-cols-[1.35fr_1fr] xl:gap-16">
        <div>
          <div className="flex gap-8 border-b border-ink/10" role="tablist">
            {(["details", "history"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx("-mb-px border-b-2 pb-3 text-sm uppercase tracking-[0.16em]", tab === t ? "border-gold" : "border-transparent text-ink-muted")}>
                {t === "details" ? "Lot details" : `Bid history (${lot.bidCount})`}
              </button>
            ))}
          </div>
          {tab === "details" ? (
            <div className="py-8">
              <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                {[
                  ["Medium", lot.medium],
                  ["Dimensions", lot.dimensions],
                  ["Date", lot.year],
                  ["Signature", lot.signature],
                ].map(([k, v]) => v && (
                  <div key={k} className="border-b border-ink/5 pb-3"><dt className="eyebrow">{k}</dt><dd className="mt-1">{v}</dd></div>
                ))}
              </dl>
              {lot.description && (<><h3 className="mt-10 text-2xl">Catalogue note</h3><p className="mt-3 leading-relaxed text-ink-soft">{lot.description}</p></>)}
              {lot.provenance && (<><h3 className="mt-10 text-2xl">Provenance</h3><p className="mt-3 text-sm leading-relaxed text-ink-soft">{lot.provenance}</p></>)}
              {lot.artist?.bio && (<><h3 className="mt-10 text-2xl">About the artist</h3><p className="mt-3 text-sm leading-relaxed text-ink-soft">{lot.artist.bio}</p></>)}
            </div>
          ) : (
            <div className="py-4"><BidHistory bids={bids} currency={currency} /></div>
          )}
        </div>
        <aside className="hidden lg:block">
          <div className="border border-ink/10 p-6">
            <h3 className="text-2xl">Live activity</h3>
            <p className="mt-1 text-xs text-ink-muted">Updates instantly as bids arrive.</p>
            <div className="mt-4 max-h-[420px] overflow-y-auto"><BidHistory bids={bids.slice(0, 12)} currency={currency} /></div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {zoom && images.length > 0 && (
          <ZoomViewer images={images} index={active} title={`${lot.artist?.name ?? ""} — ${lot.title}`} onIndex={setActive} onClose={() => setZoom(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function NavBtn({ to, label, children }: { to: string | null; label: string; children: ReactNode }) {
  if (!to) return <span className="flex items-center gap-1 px-3 py-1.5 text-ink-muted/40">{children}</span>;
  return <Link to={`/lots/${to}`} aria-label={label} className="flex items-center gap-1 px-3 py-1.5 hover:text-gold-dark">{children}</Link>;
}
