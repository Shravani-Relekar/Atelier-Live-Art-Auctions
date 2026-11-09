import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Artist, AuctionSummary, Lot, LotImage } from "@/lib/types";
import { dateRange, estimate, lifespan, moneyShort } from "@/lib/format";
import { ArtImage } from "@/components/ArtImage";
import { Countdown } from "@/components/Countdown";
import { LotCard, LotCardSkeleton } from "@/components/LotCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionHeading } from "@/components/common";
import { TrustBar } from "@/components/Layout";
import { useLotSubscriptions } from "@/hooks/useRealtime";

export default function Home() {
  const featured = useQuery({ queryKey: ["lots", "featured"], queryFn: () => api.get<{ lots: Lot[] }>("/lots/featured") });
  const ending = useQuery({ queryKey: ["lots", "ending"], queryFn: () => api.get<{ lots: Lot[] }>("/lots/ending-soon") });
  const live = useQuery({ queryKey: ["auctions", "LIVE"], queryFn: () => api.get<{ auctions: AuctionSummary[] }>("/auctions?status=LIVE") });
  const upcoming = useQuery({ queryKey: ["auctions", "UPCOMING"], queryFn: () => api.get<{ auctions: AuctionSummary[] }>("/auctions?status=UPCOMING") });
  const past = useQuery({ queryKey: ["auctions", "CLOSED"], queryFn: () => api.get<{ auctions: AuctionSummary[] }>("/auctions?status=CLOSED&limit=4") });
  const artists = useQuery({ queryKey: ["artists"], queryFn: () => api.get<{ artists: Array<Artist & { lotCount: number; coverImage: LotImage | null }> }>("/artists") });

  useLotSubscriptions([...(featured.data?.lots ?? []), ...(ending.data?.lots ?? [])].map((l) => l.id));

  const spotlight = artists.data?.artists.find((a) => a.slug === "amrita-sher-gil") ?? artists.data?.artists[0];

  return (
    <>
      <Hero lots={featured.data?.lots ?? []} loading={featured.isLoading} />

      {/* Live & upcoming sales */}
      <section className="container-x py-20">
        <SectionHeading eyebrow="Now bidding" title="Current auctions" action={<Link to="/auctions" className="link-underline text-sm">View all auctions</Link>} />
        <div className="grid gap-8 md:grid-cols-2">
          {[...(live.data?.auctions ?? []), ...(upcoming.data?.auctions ?? [])].slice(0, 4).map((a) => (
            <AuctionFeature key={a.id} auction={a} />
          ))}
          {live.isLoading && [0, 1].map((i) => <div key={i} className="aspect-[16/10] animate-pulse bg-paper-deep" />)}
        </div>
      </section>

      {/* Ending soon */}
      <section className="bg-paper-deep/60 py-20">
        <div className="container-x">
          <SectionHeading eyebrow="Don't miss out" title="Closing soon" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-3 xl:grid-cols-4">
            {ending.isLoading
              ? Array.from({ length: 4 }, (_, i) => <LotCardSkeleton key={i} />)
              : ending.data?.lots.slice(0, 8).map((l) => <LotCard key={l.id} lot={l} showAuction />)}
          </div>
        </div>
      </section>

      {/* Explore tiles */}
      <section className="container-x py-20">
        <SectionHeading eyebrow="Explore" title="Find your next acquisition" />
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              to: "/auctions",
              label: "Live Auctions",
              body: "Bid in real time on paintings closing today.",
              img: featured.data?.lots[0]?.images?.[0] ?? live.data?.auctions?.[0]?.previewImages?.[0] ?? past.data?.auctions?.[0]?.previewImages?.[0],
            },
            {
              to: "/auctions?tab=upcoming",
              label: "Upcoming Sales",
              body: "Preview catalogues and set reminders.",
              img: featured.data?.lots[3]?.images?.[0] ?? upcoming.data?.auctions?.[0]?.previewImages?.[0] ?? past.data?.auctions?.[1]?.previewImages?.[0],
            },
            {
              to: "/artists",
              label: "Artists",
              body: "Biographies, works and results by artist.",
              img: featured.data?.lots[5]?.images?.[0] ?? spotlight?.coverImage ?? past.data?.auctions?.[2]?.previewImages?.[0],
            },
          ].map((t) => (
            <Link key={t.label} to={t.to} className="group relative block aspect-[4/3] overflow-hidden bg-ink">
              <ArtImage image={t.img} width={800} fit="cover" className="absolute inset-0 h-full w-full bg-ink opacity-60 transition duration-700 group-hover:scale-105 group-hover:opacity-50" />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-6 text-paper">
                <h3 className="text-3xl">{t.label}</h3>
                <p className="mt-1 text-sm text-paper/80">{t.body}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold-light">Explore <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Artist spotlight */}
      {spotlight && (
        <section className="bg-ink text-paper">
          <div className="container-x grid items-center gap-12 py-20 md:grid-cols-2">
            <div className="aspect-square bg-[#1d1a17] p-8">
              <ArtImage image={spotlight.coverImage} width={900} className="h-full w-full bg-transparent" />
            </div>
            <div>
              <p className="eyebrow text-gold-light">Artist spotlight</p>
              <h2 className="mt-3 text-5xl md:text-6xl">{spotlight.name}</h2>
              <p className="mt-2 text-paper/60">{spotlight.country} · {lifespan(spotlight.born, spotlight.died)}</p>
              <p className="mt-6 max-w-xl leading-relaxed text-paper/80">{spotlight.bio}</p>
              <Link to={`/artists/${spotlight.slug}`} className="btn mt-8 border border-paper/40 text-paper hover:bg-paper hover:text-ink">Learn more</Link>
            </div>
          </div>
        </section>
      )}

      {/* Past auctions */}
      <section className="container-x py-20">
        <SectionHeading eyebrow="Results" title="Past auctions" action={<Link to="/auctions?tab=past" className="link-underline text-sm">All results</Link>} />
        <div className="divide-y divide-ink/10 border-y border-ink/10">
          {past.data?.auctions.map((a) => (
            <Link key={a.id} to={`/auctions/${a.slug}`} className="group grid grid-cols-[80px_1fr_auto] items-center gap-6 py-5 md:grid-cols-[120px_1fr_auto_auto]">
              <ArtImage image={a.previewImages[0]} width={240} fit="cover" className="aspect-square" />
              <div>
                <h3 className="text-2xl transition group-hover:text-gold-dark">{a.title}</h3>
                <p className="text-sm text-ink-muted">{dateRange(a.startsAt, a.endsAt)} · {a.lotCount} lots</p>
              </div>
              <div className="hidden text-right md:block">
                <p className="eyebrow">Sale total</p>
                <p className="font-display text-2xl">{moneyShort(a.soldTotal, a.currency)}</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-ink-muted group-hover:text-ink">View</span>
            </Link>
          ))}
          {past.data?.auctions.length === 0 && <p className="py-8 text-sm text-ink-muted">No past auctions yet.</p>}
        </div>
      </section>

      <TrustBar />
    </>
  );
}

function Hero({ lots, loading }: { lots: Lot[]; loading: boolean }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = lots.length;

  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 7000);
    return () => clearInterval(t);
  }, [n, paused]);

  if (loading || n === 0) {
    return <section className="h-[78vh] min-h-[520px] animate-pulse bg-paper-deep" />;
  }
  const lot = lots[i % n];
  const currency = lot.auction?.currency ?? "INR";

  return (
    <section className="relative overflow-hidden bg-[#1a1714] text-paper" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="container-x grid min-h-[78vh] items-center gap-10 py-14 lg:grid-cols-[1.25fr_1fr]">
        <AnimatePresence mode="wait">
          <motion.div key={lot.id} initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="relative order-1 h-[46vh] lg:order-none lg:h-[64vh]">
            <Link to={`/lots/${lot.id}`} aria-label={`View ${lot.title}`}>
              <ArtImage image={lot.images?.[0]} alt={lot.title} width={1600} priority sizes="(min-width:1024px) 60vw, 100vw" className="h-full w-full bg-transparent" imgClassName="drop-shadow-[0_30px_50px_rgba(0,0,0,0.6)]" />
            </Link>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div key={lot.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.6, delay: 0.15 }}>
            <div className="flex items-center gap-3">
              <StatusBadge status={lot.status} />
              <span className="eyebrow text-paper/60">{lot.auction?.title}</span>
            </div>
            <h1 className="mt-5 text-5xl leading-[1.02] md:text-7xl">{lot.artist?.name}</h1>
            <p className="mt-3 font-display text-2xl italic text-paper/80">{lot.title}{lot.year ? `, ${lot.year}` : ""}</p>
            <dl className="mt-8 grid max-w-md grid-cols-2 gap-6 border-t border-paper/15 pt-6">
              <div><dt className="eyebrow text-paper/50">Estimate</dt><dd className="mt-1 text-lg">{estimate(lot.estimateLow, lot.estimateHigh, currency)}</dd></div>
              <div>
                <dt className="eyebrow text-paper/50">{lot.status === "LIVE" ? "Closes in" : "Opens in"}</dt>
                <dd className="mt-1 text-lg"><Countdown to={lot.status === "LIVE" ? lot.endsAt : lot.startsAt} /></dd>
              </div>
            </dl>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to={`/lots/${lot.id}`} className="btn-gold">{lot.status === "LIVE" ? "Bid now" : "View lot"}</Link>
              {lot.auction && <Link to={`/auctions/${lot.auction.slug}`} className="btn border border-paper/30 text-paper hover:bg-paper hover:text-ink">View auction</Link>}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {n > 1 && (
        <div className="container-x absolute inset-x-0 bottom-6 flex items-center gap-4">
          <button onClick={() => setI((x) => (x - 1 + n) % n)} className="p-2 text-paper/70 hover:text-paper" aria-label="Previous"><ChevronLeft /></button>
          <div className="flex gap-2">
            {lots.map((l, idx) => (
              <button key={l.id} onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`} className={`h-[2px] transition-all ${idx === i % n ? "w-10 bg-gold-light" : "w-5 bg-paper/30"}`} />
            ))}
          </div>
          <button onClick={() => setI((x) => (x + 1) % n)} className="p-2 text-paper/70 hover:text-paper" aria-label="Next"><ChevronRight /></button>
        </div>
      )}
    </section>
  );
}

export function AuctionFeature({ auction }: { auction: AuctionSummary }) {
  const live = auction.status === "LIVE";
  return (
    <Link to={`/auctions/${auction.slug}`} className="group block">
      <div className="grid aspect-[16/10] grid-cols-3 gap-1 overflow-hidden bg-paper-deep">
        <ArtImage image={auction.previewImages[0]} width={900} fit="cover" className="col-span-2 row-span-2 h-full transition duration-700 group-hover:opacity-90" />
        <ArtImage image={auction.previewImages[1]} width={400} fit="cover" className="h-full" />
        <ArtImage image={auction.previewImages[2]} width={400} fit="cover" className="h-full" />
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><StatusBadge status={auction.status} /><span className="text-sm text-ink-muted">{dateRange(auction.startsAt, auction.endsAt)}</span></div>
          <h3 className="mt-3 text-3xl transition group-hover:text-gold-dark">{auction.title}</h3>
          {auction.subtitle && <p className="mt-1 text-ink-muted">{auction.subtitle}</p>}
        </div>
        <div className="shrink-0 text-right text-sm">
          <p className="eyebrow">{live ? "First lot closes" : "Opens in"}</p>
          <p className="mt-1 font-medium"><Countdown to={live ? auction.endsAt : auction.startsAt} doneLabel={live ? "Closing in sequence" : "Opening…"} /></p>
          <p className="mt-1 text-ink-muted">{auction.lotCount} lots</p>
        </div>
      </div>
    </Link>
  );
}
