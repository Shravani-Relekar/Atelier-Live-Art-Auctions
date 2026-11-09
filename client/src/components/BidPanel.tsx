import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { CheckCircle2, Heart, Info, Loader2, ShieldAlert, Timer, TrendingUp } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { bidLadder, snapToLadder } from "@/lib/increments";
import { money, moneyShort } from "@/lib/format";
import type { AppConfig, Bid, Lot, LotDetailResponse, LotState } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { patchLotEverywhere } from "@/hooks/useRealtime";
import { Countdown } from "./Countdown";
import { useFlashOnChange } from "./LotCard";

interface Props {
  lot: Lot;
  bids: Bid[];
  viewer: LotDetailResponse["viewer"];
}

interface BidResponse {
  lot: LotState;
  bids: Bid[];
  leading: boolean;
  extended: boolean;
  proxyOnly: boolean;
  message: string;
}

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => api.get<AppConfig>("/config"), staleTime: Infinity });
}

export function BidPanel({ lot, bids, viewer }: Props) {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: config } = useConfig();
  const currency = lot.auction?.currency ?? "INR";
  const premiumPct = config?.rules.buyersPremiumPercent ?? 20;

  const ladder = useMemo(() => bidLadder(lot.nextMinBid, 3), [lot.nextMinBid]);
  const [amount, setAmount] = useState<number>(lot.nextMinBid);
  const [custom, setCustom] = useState("");
  const [useMax, setUseMax] = useState(false);
  const [maxInput, setMaxInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const flash = useFlashOnChange(lot.currentBid);

  // Keep the selected amount valid as the price moves underneath the user.
  useEffect(() => {
    setAmount((a) => (a < lot.nextMinBid ? lot.nextMinBid : a));
  }, [lot.nextMinBid]);

  const leading = !!user && lot.highestBidderId === user.id;
  const hasBid = !!user && bids.some((b) => b.bidderId === user.id);
  const outbid = hasBid && !leading;
  const maxAmount = useMax ? Number(maxInput.replace(/[^\d]/g, "")) || 0 : undefined;
  const maxInvalid = useMax && (!maxAmount || maxAmount < amount);

  const bid = useMutation({
    mutationFn: (body: { amount: number; maxAmount?: number }) => api.post<BidResponse>(`/lots/${lot.id}/bids`, body),
    onSuccess: (res) => {
      patchLotEverywhere(qc, res.lot, res.bids);
      if (res.proxyOnly || maxAmount) {
        qc.setQueryData<LotDetailResponse>(["lot", lot.id], (d) => (d && d.viewer ? { ...d, viewer: { ...d.viewer, maxBid: maxAmount ?? d.viewer.maxBid } } : d));
      }
      void qc.invalidateQueries({ queryKey: ["me", "bids"] });
      toast({ tone: res.leading ? "success" : "outbid", title: res.leading ? "Bid accepted" : "Outbid immediately", body: res.message });
      setConfirming(false);
      setCustom("");
      setUseMax(false);
      setMaxInput("");
    },
    onError: (err) => {
      setConfirming(false);
      const e = err as ApiError;
      const min = (e.details as { minimum?: number } | undefined)?.minimum;
      if (min) setAmount(min);
      toast({ tone: "error", title: e.code === "BID_TOO_LOW" ? "Someone bid first" : "Bid not placed", body: e.message });
    },
  });

  const watch = useMutation({
    mutationFn: (on: boolean) => (on ? api.post(`/lots/${lot.id}/watch`) : api.del(`/lots/${lot.id}/watch`)),
    onMutate: (on) => qc.setQueryData<LotDetailResponse>(["lot", lot.id], (d) => (d && d.viewer ? { ...d, viewer: { ...d.viewer, isWatching: on } } : d)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["me", "watchlist"] }),
  });

  const applyCustom = (raw: string) => {
    setCustom(raw);
    const n = Number(raw.replace(/[^\d]/g, ""));
    if (n > 0) setAmount(snapToLadder(n, lot.nextMinBid));
  };

  const premium = Math.round((amount * premiumPct) / 100);
  const live = lot.status === "LIVE";
  const closed = lot.status === "SOLD" || lot.status === "PASSED" || lot.status === "WITHDRAWN";

  return (
    <div className="border border-ink/10 bg-paper-card">
      {/* Price block */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{closed ? (lot.status === "SOLD" ? "Sold for" : "Highest bid") : lot.currentBid ? "Current bid" : "Starting bid"}</p>
            <p className={clsx("mt-1 font-display text-4xl tabular-nums", flash && "animate-flash")}>{money(lot.currentBid ?? lot.startingBid, currency)}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {lot.bidCount} bid{lot.bidCount === 1 ? "" : "s"}
              {lot.hasReserve && lot.currentBid != null && (
                <span className={clsx("ml-2", lot.reserveMet ? "text-emerald-700" : "text-ink-muted")}>· {lot.reserveMet ? "Reserve met" : "Reserve not met"}</span>
              )}
            </p>
          </div>
          {user && (
            <button onClick={() => watch.mutate(!viewer?.isWatching)} className={clsx("flex items-center gap-1.5 text-xs uppercase tracking-[0.14em]", viewer?.isWatching ? "text-live" : "text-ink-muted hover:text-ink")} aria-pressed={!!viewer?.isWatching}>
              <Heart className={clsx("h-4 w-4", viewer?.isWatching && "fill-current")} /> {viewer?.isWatching ? "Watching" : "Watch"}
            </button>
          )}
        </div>

        {live && (
          <div className="mt-5">
            <p className="eyebrow mb-2 flex items-center gap-1.5"><Timer className="h-3.5 w-3.5" /> Lot closes in</p>
            <Countdown to={lot.endsAt} variant="blocks" />
            {lot.extensionCount > 0 && (
              <p className="mt-2 text-xs text-gold-dark">Extended {lot.extensionCount}× by late bidding (soft close)</p>
            )}
          </div>
        )}
        {lot.status === "UPCOMING" && (
          <div className="mt-5">
            <p className="eyebrow mb-2">Bidding opens in</p>
            <Countdown to={lot.startsAt} variant="blocks" doneLabel="Opening…" />
          </div>
        )}
      </div>

      {/* Standing banner */}
      <AnimatePresence initial={false}>
        {live && (leading || outbid) && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className={clsx("flex items-center gap-2 px-6 py-3 text-sm font-medium", leading ? "bg-emerald-700 text-white" : "bg-live text-white")}>
              {leading ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {leading ? "You are the highest bidder" : "You have been outbid"}
              {leading && viewer?.maxBid && viewer.maxBid > (lot.currentBid ?? 0) && (
                <span className="ml-auto text-xs font-normal opacity-90">Your max: {moneyShort(viewer.maxBid, currency)}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bidding controls */}
      {live && (
        <div className="border-t border-ink/10 p-6">
          {!user ? (
            <div className="text-center">
              <p className="text-sm text-ink-muted">Register or log in to place a bid.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Link to="/login" state={{ from: location.pathname }} className="btn-outline">Log in</Link>
                <Link to="/register" state={{ from: location.pathname }} className="btn-primary">Register</Link>
              </div>
            </div>
          ) : (
            <>
              <p className="eyebrow mb-3">{leading ? "Raise your maximum bid" : "Choose your bid"}</p>
              {!leading && (
                <div className="grid grid-cols-3 gap-2">
                  {ladder.map((v) => (
                    <button key={v} onClick={() => { setAmount(v); setCustom(""); }} className={clsx("border px-2 py-3 text-sm tabular-nums transition", amount === v && !custom ? "border-ink bg-ink text-paper" : "border-ink/15 hover:border-ink")}>
                      {moneyShort(v, currency)}
                    </button>
                  ))}
                </div>
              )}
              {!leading && (
                <div className="mt-3">
                  <label className="label" htmlFor="custom-bid">Or enter an amount</label>
                  <input id="custom-bid" inputMode="numeric" className="input tabular-nums" placeholder={`${lot.nextMinBid.toLocaleString("en-IN")} or more`} value={custom} onChange={(e) => applyCustom(e.target.value)} />
                  {custom && <p className="mt-1 text-xs text-ink-muted">Rounded to the bid increment: {money(amount, currency)}</p>}
                </div>
              )}

              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 accent-[#a8833e]" checked={useMax || leading} disabled={leading} onChange={(e) => setUseMax(e.target.checked)} />
                <span>
                  <span className="font-medium">Set a maximum bid</span>
                  <span className="block text-xs text-ink-muted">We'll bid on your behalf, one increment at a time, up to this amount. It stays confidential.</span>
                </span>
              </label>
              {(useMax || leading) && (
                <input inputMode="numeric" className="input mt-2 tabular-nums" placeholder={`Maximum (at least ${(leading ? lot.nextMinBid : amount).toLocaleString("en-IN")})`} value={maxInput} onChange={(e) => { setMaxInput(e.target.value); setUseMax(true); }} />
              )}

              {!confirming ? (
                <button
                  className="btn-primary mt-5 w-full py-4"
                  disabled={bid.isPending || (leading ? !maxAmount || maxAmount < lot.nextMinBid : maxInvalid)}
                  onClick={() => setConfirming(true)}
                >
                  <TrendingUp className="h-4 w-4" />
                  {leading ? `Set max ${maxAmount ? moneyShort(maxAmount, currency) : ""}` : `Bid ${money(amount, currency)}`}
                </button>
              ) : (
                <div className="mt-5 border border-gold/40 bg-gold/5 p-4">
                  <dl className="space-y-1 text-sm">
                    {!leading && <Row k="Your bid" v={money(amount, currency)} />}
                    {maxAmount ? <Row k="Maximum bid" v={money(maxAmount, currency)} /> : null}
                    {!leading && <Row k={`Buyer's premium (${premiumPct}%)`} v={money(premium, currency)} />}
                    {!leading && <Row k="Total if you win at this bid" v={money(amount + premium, currency)} strong />}
                  </dl>
                  <p className="mt-3 text-xs text-ink-muted">Bids are binding. Taxes and shipping are calculated on the invoice.</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button className="btn-outline" onClick={() => setConfirming(false)} disabled={bid.isPending}>Cancel</button>
                    <button className="btn-gold" disabled={bid.isPending} onClick={() => bid.mutate({ amount: leading ? lot.nextMinBid : amount, maxAmount })}>
                      {bid.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {closed && (
        <div className="border-t border-ink/10 p-6 text-sm">
          {lot.status === "SOLD" && user && lot.highestBidderId === user.id ? (
            <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 className="h-5 w-5" /> You won this lot. Our team will be in touch with your invoice.</p>
          ) : (
            <p className="text-ink-muted">Bidding on this lot has closed{lot.status === "PASSED" ? " — the lot did not sell." : "."}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 border-t border-ink/10 px-6 py-4 text-xs text-ink-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          A {premiumPct}% buyer's premium is added to the hammer price. Bids in the final {Math.round((config?.rules.softCloseWindowSeconds ?? 120) / 60)} minutes extend the close by {Math.round((config?.rules.softCloseExtensionSeconds ?? 120) / 60)} minutes.
        </span>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={clsx("flex justify-between gap-4", strong && "border-t border-ink/10 pt-1 font-semibold")}>
      <dt className={strong ? "" : "text-ink-muted"}>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
