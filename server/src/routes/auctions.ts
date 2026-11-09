import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, validate } from "../middleware/validate";
import { notFound } from "../lib/errors";
import { publicAuction, publicLot } from "../lib/serializers";

const router = Router();

const listQuery = z.object({
  status: z.enum(["LIVE", "UPCOMING", "CLOSED"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get(
  "/",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const { status, limit } = req.query as unknown as z.infer<typeof listQuery>;
    const auctions = await prisma.auction.findMany({
      where: status ? { status } : { status: { not: "DRAFT" } },
      orderBy: status === "CLOSED" ? { endsAt: "desc" } : { startsAt: "asc" },
      take: limit,
      include: {
        _count: { select: { lots: true } },
        lots: {
          orderBy: { lotNumber: "asc" },
          take: 4,
          select: { images: { orderBy: { position: "asc" }, take: 1 } },
        },
      },
    });
    const totals = await prisma.lot.groupBy({
      by: ["auctionId"],
      where: { auctionId: { in: auctions.map((a) => a.id) }, status: "SOLD" },
      _sum: { currentBid: true },
      _count: true,
    });
    const totalMap = new Map(totals.map((t) => [t.auctionId, t]));
    res.json({
      auctions: auctions.map((a) => ({
        ...publicAuction(a),
        lotCount: a._count.lots,
        previewImages: a.lots.flatMap((l) => l.images).map((i) => ({ provider: i.provider, publicId: i.publicId, url: i.url })),
        soldTotal: totalMap.get(a.id)?._sum.currentBid ?? 0,
        soldCount: totalMap.get(a.id)?._count ?? 0,
      })),
    });
  }),
);

const lotsQuery = z.object({
  sort: z.enum(["lot", "ending", "priceAsc", "priceDesc", "bids"]).default("lot"),
  q: z.string().trim().max(80).optional(),
});

router.get(
  "/:slug",
  validate(lotsQuery, "query"),
  asyncHandler(async (req, res) => {
    const { sort, q } = req.query as unknown as z.infer<typeof lotsQuery>;
    const auction = await prisma.auction.findUnique({ where: { slug: req.params.slug } });
    if (!auction || auction.status === "DRAFT") throw notFound("Auction not found");

    const orderBy =
      sort === "ending"
        ? [{ endsAt: "asc" as const }]
        : sort === "priceAsc"
          ? [{ currentBid: { sort: "asc" as const, nulls: "first" as const } }, { estimateLow: "asc" as const }]
          : sort === "priceDesc"
            ? [{ currentBid: { sort: "desc" as const, nulls: "last" as const } }, { estimateHigh: "desc" as const }]
            : sort === "bids"
              ? [{ bidCount: "desc" as const }]
              : [{ lotNumber: "asc" as const }];

    const lots = await prisma.lot.findMany({
      where: {
        auctionId: auction.id,
        status: { not: "WITHDRAWN" },
        ...(q
          ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { artist: { name: { contains: q, mode: "insensitive" } } }] }
          : {}),
      },
      orderBy,
      include: { artist: true, images: { orderBy: { position: "asc" }, take: 2 } },
    });
    res.json({ auction: publicAuction(auction), lots: lots.map(publicLot) });
  }),
);

export default router;
