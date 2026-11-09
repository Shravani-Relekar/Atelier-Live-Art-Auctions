import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, validate } from "../middleware/validate";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { notFound } from "../lib/errors";
import { lotState, publicBid, publicLot } from "../lib/serializers";
import { MAX_BID_AMOUNT } from "../lib/increments";
import { placeBid } from "../services/bidding";

const router = Router();

const bidLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anon",
  message: { error: { code: "RATE_LIMITED", message: "Too many bids in a short time. Please slow down." } },
});

router.get(
  "/featured",
  asyncHandler(async (_req, res) => {
    let lots = await prisma.lot.findMany({
      where: { status: { in: ["LIVE", "UPCOMING"] }, images: { some: {} }, auction: { status: { not: "DRAFT" } } },
      orderBy: [{ estimateHigh: "desc" }],
      take: 8,
      include: { artist: true, images: { orderBy: { position: "asc" }, take: 1 }, auction: true },
    });
    if (lots.length === 0) {
      lots = await prisma.lot.findMany({
        where: { images: { some: {} }, status: { not: "WITHDRAWN" }, auction: { status: { not: "DRAFT" } } },
        orderBy: [{ estimateHigh: "desc" }],
        take: 8,
        include: { artist: true, images: { orderBy: { position: "asc" }, take: 1 }, auction: true },
      });
    }
    res.json({ lots: lots.map(publicLot) });
  }),
);

router.get(
  "/ending-soon",
  asyncHandler(async (_req, res) => {
    const lots = await prisma.lot.findMany({
      where: { status: "LIVE" },
      orderBy: { endsAt: "asc" },
      take: 8,
      include: { artist: true, images: { orderBy: { position: "asc" }, take: 1 }, auction: true },
    });
    res.json({ lots: lots.map(publicLot) });
  }),
);

router.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const lot = await prisma.lot.findUnique({
      where: { id: req.params.id },
      include: {
        artist: true,
        auction: true,
        images: { orderBy: { position: "asc" } },
        bids: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!lot || lot.status === "WITHDRAWN") throw notFound("Lot not found");

    const [neighbours, viewer] = await Promise.all([
      prisma.lot.findMany({
        where: { auctionId: lot.auctionId, lotNumber: { in: [lot.lotNumber - 1, lot.lotNumber + 1] } },
        select: { id: true, lotNumber: true },
      }),
      req.user
        ? Promise.all([
            prisma.watchlist.findUnique({ where: { userId_lotId: { userId: req.user.id, lotId: lot.id } } }),
            prisma.autoBid.findUnique({ where: { lotId_userId: { lotId: lot.id, userId: req.user.id } } }),
          ])
        : Promise.resolve(null),
    ]);

    res.json({
      lot: publicLot(lot),
      bids: lot.bids.map(publicBid),
      prevLotId: neighbours.find((n) => n.lotNumber === lot.lotNumber - 1)?.id ?? null,
      nextLotId: neighbours.find((n) => n.lotNumber === lot.lotNumber + 1)?.id ?? null,
      viewer: viewer
        ? { isWatching: Boolean(viewer[0]), maxBid: viewer[1]?.maxAmount ?? null }
        : null,
      serverTime: Date.now(),
    });
  }),
);

const bidsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  "/:id/bids",
  validate(bidsQuery, "query"),
  asyncHandler(async (req, res) => {
    const { cursor, limit } = req.query as unknown as z.infer<typeof bidsQuery>;
    const bids = await prisma.bid.findMany({
      where: { lotId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = bids.length > limit;
    const page = bids.slice(0, limit);
    res.json({ bids: page.map(publicBid), nextCursor: hasMore ? page[page.length - 1].id : null });
  }),
);

const bidSchema = z.object({
  amount: z.number().int().positive().max(MAX_BID_AMOUNT),
  maxAmount: z.number().int().positive().max(MAX_BID_AMOUNT).optional(),
});

router.post(
  "/:id/bids",
  requireAuth,
  bidLimiter,
  validate(bidSchema),
  asyncHandler(async (req, res) => {
    const { amount, maxAmount } = req.body as z.infer<typeof bidSchema>;
    const result = await placeBid({ userId: req.user!.id, lotId: req.params.id, amount, maxAmount });
    const leading = result.lot.highestBidderId === req.user!.id;
    res.status(result.proxyOnly ? 200 : 201).json({
      lot: lotState(result.lot),
      bids: result.bids.map(publicBid),
      leading,
      extended: result.extended,
      proxyOnly: result.proxyOnly,
      // When a competing max-bid immediately outbid the caller, tell them plainly.
      message: result.proxyOnly
        ? "Your maximum bid has been updated."
        : leading
          ? "You are the highest bidder."
          : "You were immediately outbid by another bidder's maximum bid.",
    });
  }),
);

router.post(
  "/:id/watch",
  requireAuth,
  asyncHandler(async (req, res) => {
    const lot = await prisma.lot.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!lot) throw notFound("Lot not found");
    await prisma.watchlist.upsert({
      where: { userId_lotId: { userId: req.user!.id, lotId: lot.id } },
      create: { userId: req.user!.id, lotId: lot.id },
      update: {},
    });
    res.json({ isWatching: true });
  }),
);

router.delete(
  "/:id/watch",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.watchlist.deleteMany({ where: { userId: req.user!.id, lotId: req.params.id } });
    res.json({ isWatching: false });
  }),
);

export default router;
