import { memo, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Clock } from "lucide-react";
import type { Lot } from "@/lib/types";
import { estimate, moneyShort } from "@/lib/format";
import { ArtImage } from "./ArtImage";
import { Countdown } from "./Countdown";
import { StatusBadge } from "./StatusBadge";
import { useAuth } from "@/context/AuthContext";

function LotCardImpl({ lot, currency = lot.auction?.currency ?? "INR", showAuction }: { lot: Lot; currency?: string; showAuction?: boolean }) {
  const { user } = useAuth();
  const flash = useFlashOnChange(lot.currentBid);
  const leading = user && lot.highestBidderId === user.id;
  const live = lot.status === "LIVE";
  const closed = lot.status === "SOLD" || lot.status === "PASSED";

  return (
    <motion.article layout="position" className="group flex flex-col">
      <Link to={`/lots/${lot.id}`} className="block">
        <div className="relative aspect-[4/5] bg-paper-deep p-5 transition group-hover:bg-[#e9e1d2]">
          <ArtImage image={lot.images?.[0]} alt={lot.title} width={600} className="h-full w-full bg-transparent" imgClassName="drop-shadow-[0_10px_18px_rgba(20,18,16,0.25)] transition duration-700 group-hover:scale-[1.02]" sizes="(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw" />
          <div className="absolute left-3 top-3"><StatusBadge status={lot.status} /></div>
          {leading && live && <span className="absolute right-3 top-3 bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Leading</span>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">Lot {lot.lotNumber}</span>
          {live && (
            <span className="flex items-center gap-1 text-xs text-ink-muted"><Clock className="h-3.5 w-3.5" /><Countdown to={lot.endsAt} /></span>
          )}
          {lot.status === "UPCOMING" && <span className="text-xs text-ink-muted">Opens <Countdown to={lot.startsAt} doneLabel="now" /></span>}
        </div>
        <Link to={`/lots/${lot.id}`}>
          <h3 className="mt-1 font-display text-xl leading-snug">{lot.artist?.name}</h3>
          <p className="line-clamp-1 text-sm italic text-ink-soft">{lot.title}{lot.year ? `, ${lot.year}` : ""}</p>
        </Link>
        {showAuction && lot.auction && <p className="mt-1 line-clamp-1 text-xs text-ink-muted">{lot.auction.title}</p>}
        <div className="mt-3 border-t border-ink/10 pt-3 text-sm">
          <div className="flex justify-between text-ink-muted"><span>Estimate</span><span>{estimate(lot.estimateLow, lot.estimateHigh, currency)}</span></div>
          <div className={clsx("mt-1 flex justify-between", flash && "animate-flash")}>
            <span className="text-ink-muted">{closed ? (lot.status === "SOLD" ? "Hammer" : "Highest bid") : lot.currentBid ? "Current bid" : "Starting bid"}</span>
            <span className="font-semibold">
              {moneyShort(lot.currentBid ?? lot.startingBid, currency)}
              {lot.bidCount > 0 && <span className="ml-1 font-normal text-ink-muted">({lot.bidCount})</span>}
            </span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export const LotCard = memo(LotCardImpl);

/** True for ~1.2s after the value changes — used to flash a price on a new bid. */
export function useFlashOnChange(value: unknown) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current !== value && prev.current !== undefined) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1200);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return flash;
}

export function LotCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[4/5] bg-paper-deep" />
      <div className="mt-4 h-3 w-16 bg-paper-deep" />
      <div className="mt-2 h-5 w-3/4 bg-paper-deep" />
      <div className="mt-2 h-4 w-1/2 bg-paper-deep" />
    </div>
  );
}
