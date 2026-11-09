import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { publicLot } from "../lib/serializers";

const router = Router();
router.use(requireAuth);

/** Every lot the user has bid on, with their own top bid and live standing. */
router.get(
  "/bids",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const grouped = await prisma.bid.groupBy({
      by: ["lotId"],
      where: { userId },
      _max: { amount: true, createdAt: true },
      _count: true,
    });
    const lots = await prisma.lot.findMany({
      where: { id: { in: grouped.map((g) => g.lotId) } },
      include: { artist: true, auction: true, images: { orderBy: { position: "asc" }, take: 1 } },
    });
    const autoBids = await prisma.autoBid.findMany({ where: { userId, lotId: { in: lots.map((l) => l.id) } } });
    const byLot = new Map(grouped.map((g) => [g.lotId, g]));
    const autoByLot = new Map(autoBids.map((a) => [a.lotId, a.maxAmount]));

    const items = lots
      .map((lot) => {
        const g = byLot.get(lot.id)!;
        const leading = lot.highestBidderId === userId;
        const closed = lot.status === "SOLD" || lot.status === "PASSED";
        const standing = closed ? (leading && lot.status === "SOLD" ? "WON" : leading ? "RESERVE_NOT_MET" : "LOST") : leading ? "LEADING" : "OUTBID";
        return {
          lot: publicLot(lot),
          myTopBid: g._max.amount,
          myBidCount: g._count,
          myMaxBid: autoByLot.get(lot.id) ?? null,
          lastBidAt: g._max.createdAt,
          standing,
        };
      })
      .sort((a, b) => +new Date(b.lastBidAt ?? 0) - +new Date(a.lastBidAt ?? 0));
    res.json({ items });
  }),
);

router.get(
  "/watchlist",
  asyncHandler(async (req, res) => {
    const rows = await prisma.watchlist.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: { lot: { include: { artist: true, auction: true, images: { orderBy: { position: "asc" }, take: 1 } } } },
    });
    res.json({ lots: rows.map((r) => publicLot(r.lot)) });
  }),
);

export default router;
