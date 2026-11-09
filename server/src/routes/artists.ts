import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../middleware/validate";
import { notFound } from "../lib/errors";
import { publicArtist, publicLot } from "../lib/serializers";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const artists = await prisma.artist.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { lots: true } },
        lots: { take: 1, orderBy: { estimateHigh: "desc" }, select: { images: { take: 1, orderBy: { position: "asc" } } } },
      },
    });
    res.json({
      artists: artists.map((a) => ({
        ...publicArtist(a),
        lotCount: a._count.lots,
        coverImage: a.lots[0]?.images[0] ?? null,
      })),
    });
  }),
);

router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const artist = await prisma.artist.findUnique({
      where: { slug: req.params.slug },
      include: {
        lots: {
          where: { status: { not: "WITHDRAWN" }, auction: { status: { not: "DRAFT" } } },
          orderBy: { endsAt: "desc" },
          include: { images: { orderBy: { position: "asc" }, take: 1 }, auction: true },
        },
      },
    });
    if (!artist) throw notFound("Artist not found");
    res.json({ artist: publicArtist(artist), lots: artist.lots.map((l) => publicLot({ ...l, artist })) });
  }),
);

export default router;
