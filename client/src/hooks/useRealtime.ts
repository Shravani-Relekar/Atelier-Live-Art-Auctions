import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSocket, subscribeAuction, subscribeLot } from "@/lib/socket";
import type { Bid, BidEvent, Lot, LotDetailResponse, LotState, MyBidItem } from "@/lib/types";

/**
 * Applies a lot state change to every cached query that contains that lot, so cards,
 * catalogue grids, the lot page and the account page all update from one socket event.
 */
export function patchLotEverywhere(qc: QueryClient, state: LotState, newBids: Bid[] = []) {
  const merge = <T extends Partial<Lot>>(lot: T): T => {
    if (lot.id !== state.id) return lot;
    // Ignore stale events that arrive out of order.
    if (lot.version != null && lot.version > state.version) return lot;
    return { ...lot, ...state };
  };

  qc.setQueriesData<LotDetailResponse>({ queryKey: ["lot", state.id] }, (d) => {
    if (!d) return d;
    const known = new Set(d.bids.map((b) => b.id));
    const fresh = newBids.filter((b) => !known.has(b.id)).sort((a, b) => b.amount - a.amount);
    return { ...d, lot: merge(d.lot), bids: [...fresh, ...d.bids].slice(0, 100) };
  });

  const patchList = (d: unknown): unknown => {
    if (!d || typeof d !== "object") return d;
    const obj = d as Record<string, unknown>;
    if (Array.isArray(obj.lots)) return { ...obj, lots: (obj.lots as Lot[]).map(merge) };
    if (Array.isArray(obj.items)) {
      return { ...obj, items: (obj.items as MyBidItem[]).map((it) => (it.lot.id === state.id ? { ...it, lot: merge(it.lot) } : it)) };
    }
    return d;
  };
  qc.setQueriesData({ queryKey: ["auction"] }, patchList);
  qc.setQueriesData({ queryKey: ["lots"] }, patchList);
  qc.setQueriesData({ queryKey: ["artist"] }, patchList);
  qc.setQueriesData({ queryKey: ["me"] }, patchList);
}

/** Mounted once at the app root: routes socket events into the query cache. */
export function useRealtimeBridge() {
  const qc = useQueryClient();
  useEffect(() => {
    const s = getSocket();
    const onBid = (e: BidEvent) => patchLotEverywhere(qc, e.lot, e.bids);
    const onState = (e: { lot: LotState }) => {
      patchLotEverywhere(qc, e.lot);
      if (e.lot.status !== "LIVE") void qc.invalidateQueries({ queryKey: ["me", "bids"] });
    };
    const onAuction = () => void qc.invalidateQueries({ queryKey: ["auctions"] });
    s.on("lot:bid", onBid);
    s.on("lot:update", onState);
    s.on("lot:closed", onState);
    s.on("auction:update", onAuction);
    return () => {
      s.off("lot:bid", onBid);
      s.off("lot:update", onState);
      s.off("lot:closed", onState);
      s.off("auction:update", onAuction);
    };
  }, [qc]);
}

/** Joins socket rooms for the given lots while the component is mounted. */
export function useLotSubscriptions(ids: Array<string | undefined>) {
  const key = ids.filter(Boolean).sort().join(",");
  useEffect(() => {
    if (!key) return;
    const offs = key.split(",").map(subscribeLot);
    return () => offs.forEach((off) => off());
  }, [key]);
}

export function useAuctionSubscription(id: string | undefined) {
  useEffect(() => (id ? subscribeAuction(id) : undefined), [id]);
}
