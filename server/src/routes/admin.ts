import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, validate } from "../middleware/validate";
import { requireAdmin } from "../middleware/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { publicArtist, publicAuction, publicImage, publicLot } from "../lib/serializers";
import { createUploadSignature, destroyImage, uploadImage, verifyUploadedAsset } from "../lib/cloudinary";
import { env } from "../config/env";
import { getIO, rooms } from "../socket";
import { lotState } from "../lib/serializers";

const router = Router();
router.use(requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|tiff|avif)$/.test(file.mimetype)) cb(null, true);
    else cb(badRequest("Only JPEG, PNG, WebP, TIFF or AVIF images are accepted"));
  },
});

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 80);

/* ----------------------------- Overview ----------------------------- */

router.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    const [auctions, artists, users, bidCount, sold] = await Promise.all([
      prisma.auction.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { lots: true } } } }),
      prisma.artist.findMany({ orderBy: { name: "asc" } }),
      prisma.user.count(),
      prisma.bid.count(),
      prisma.lot.aggregate({ where: { status: "SOLD" }, _sum: { currentBid: true }, _count: true }),
    ]);
    res.json({
      auctions: auctions.map((a) => ({ ...publicAuction(a), lotCount: a._count.lots })),
      artists: artists.map(publicArtist),
      stats: { users, bids: bidCount, soldLots: sold._count, soldTotal: sold._sum.currentBid ?? 0 },
    });
  }),
);

/* ----------------------------- Artists ----------------------------- */

const artistSchema = z.object({
  name: z.string().trim().min(2).max(120),
  born: z.number().int().min(1000).max(2100).optional(),
  died: z.number().int().min(1000).max(2100).optional(),
  country: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(5000).optional(),
});

router.post(
  "/artists",
  validate(artistSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof artistSchema>;
    const artist = await prisma.artist.create({ data: { ...body, slug: `${slugify(body.name)}-${Date.now().toString(36)}` } });
    res.status(201).json({ artist: publicArtist(artist) });
  }),
);

/* ----------------------------- Auctions ----------------------------- */

const auctionSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    subtitle: z.string().trim().max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    currency: z.string().trim().length(3).toUpperCase().default("INR"),
    coverImage: z.string().url().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    lotIntervalSeconds: z.number().int().min(0).max(3600).default(60),
    publish: z.boolean().default(true),
  })
  .refine((a) => a.endsAt > a.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });

router.post(
  "/auctions",
  validate(auctionSchema),
  asyncHandler(async (req, res) => {
    const { publish, ...data } = req.body as z.infer<typeof auctionSchema>;
    const auction = await prisma.auction.create({
      data: { ...data, slug: `${slugify(data.title)}-${Date.now().toString(36)}`, status: publish ? "UPCOMING" : "DRAFT" },
    });
    res.status(201).json({ auction: publicAuction(auction) });
  }),
);

router.get(
  "/auctions/:id",
  asyncHandler(async (req, res) => {
    const auction = await prisma.auction.findUnique({
      where: { id: req.params.id },
      include: { lots: { orderBy: { lotNumber: "asc" }, include: { artist: true, images: { orderBy: { position: "asc" } } } } },
    });
    if (!auction) throw notFound("Auction not found");
    res.json({
      auction: publicAuction(auction),
      // Admins can see reserves.
      lots: auction.lots.map((l) => ({ ...publicLot(l), reservePrice: l.reservePrice })),
    });
  }),
);

router.patch(
  "/auctions/:id/publish",
  asyncHandler(async (req, res) => {
    const auction = await prisma.auction.findUnique({ where: { id: req.params.id } });
    if (!auction) throw notFound("Auction not found");
    if (auction.status !== "DRAFT") throw conflict("Only draft auctions can be published");
    const updated = await prisma.auction.update({ where: { id: auction.id }, data: { status: "UPCOMING" } });
    res.json({ auction: publicAuction(updated) });
  }),
);

/* ------------------------------- Lots ------------------------------- */

const lotSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    artistId: z.string().min(1),
    year: z.string().trim().max(40).optional(),
    medium: z.string().trim().max(200).optional(),
    dimensions: z.string().trim().max(200).optional(),
    signature: z.string().trim().max(200).optional(),
    description: z.string().trim().max(10000).optional(),
    provenance: z.string().trim().max(5000).optional(),
    estimateLow: z.number().int().positive(),
    estimateHigh: z.number().int().positive(),
    startingBid: z.number().int().positive(),
    reservePrice: z.number().int().positive().optional(),
  })
  .refine((l) => l.estimateHigh >= l.estimateLow, { message: "High estimate must be ≥ low estimate", path: ["estimateHigh"] });

router.post(
  "/auctions/:id/lots",
  validate(lotSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof lotSchema>;
    const auction = await prisma.auction.findUnique({ where: { id: req.params.id } });
    if (!auction) throw notFound("Auction not found");
    if (auction.status === "CLOSED") throw conflict("Cannot add lots to a closed auction");
    const artist = await prisma.artist.findUnique({ where: { id: body.artistId } });
    if (!artist) throw badRequest("Unknown artist");

    const lot = await prisma.$transaction(async (tx) => {
      const last = await tx.lot.findFirst({ where: { auctionId: auction.id }, orderBy: { lotNumber: "desc" } });
      const lotNumber = (last?.lotNumber ?? 0) + 1;
      const endsAt = new Date(auction.endsAt.getTime() + (lotNumber - 1) * auction.lotIntervalSeconds * 1000);
      const startsAt = auction.startsAt;
      return tx.lot.create({
        data: { ...body, auctionId: auction.id, lotNumber, startsAt, endsAt, status: "UPCOMING" },
        include: { artist: true, images: true },
      });
    });
    res.status(201).json({ lot: publicLot(lot) });
  }),
);

router.post(
  "/lots/:id/withdraw",
  asyncHandler(async (req, res) => {
    const lot = await prisma.lot.findUnique({ where: { id: req.params.id } });
    if (!lot) throw notFound("Lot not found");
    if (lot.status === "SOLD" || lot.status === "PASSED") throw conflict("Lot has already closed");
    const updated = await prisma.lot.update({
      where: { id: lot.id },
      data: { status: "WITHDRAWN", closedAt: new Date(), version: { increment: 1 } },
    });
    getIO().to(rooms.lot(lot.id)).to(rooms.auction(lot.auctionId)).emit("lot:closed", { lot: lotState(updated) });
    res.json({ lot: lotState(updated) });
  }),
);

/* ------------------------------ Images ------------------------------ */

/** Signed params for direct browser -> Cloudinary upload. */
router.get(
  "/uploads/signature",
  asyncHandler(async (req, res) => {
    const lotId = typeof req.query.lotId === "string" ? req.query.lotId : undefined;
    res.json(createUploadSignature(lotId));
  }),
);

const registerImageSchema = z.object({
  publicId: z.string().min(1).max(300),
  alt: z.string().trim().max(200).optional(),
});

/** Registers an image the browser uploaded directly to Cloudinary (verified server-side). */
router.post(
  "/lots/:id/images",
  validate(registerImageSchema),
  asyncHandler(async (req, res) => {
    const { publicId, alt } = req.body as z.infer<typeof registerImageSchema>;
    const lot = await prisma.lot.findUnique({ where: { id: req.params.id }, include: { _count: { select: { images: true } } } });
    if (!lot) throw notFound("Lot not found");
    const asset = await verifyUploadedAsset(publicId);
    const image = await prisma.lotImage.create({
      data: { lotId: lot.id, provider: "CLOUDINARY", ...asset, alt, position: lot._count.images },
    });
    res.status(201).json({ image: publicImage(image) });
  }),
);

/** Fallback: multipart upload proxied through the server to Cloudinary. */
router.post(
  "/lots/:id/images/upload",
  upload.array("images", 10),
  asyncHandler(async (req, res) => {
    const lot = await prisma.lot.findUnique({ where: { id: req.params.id }, include: { _count: { select: { images: true } } } });
    if (!lot) throw notFound("Lot not found");
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest("No images provided");
    const created = [];
    let position = lot._count.images;
    for (const file of files) {
      const result = await uploadImage(file.buffer, `${env.CLOUDINARY_UPLOAD_FOLDER}/${lot.id}`);
      created.push(
        await prisma.lotImage.create({
          data: {
            lotId: lot.id,
            provider: "CLOUDINARY",
            publicId: result.public_id,
            url: result.secure_url,
            width: result.width,
            height: result.height,
            position: position++,
          },
        }),
      );
    }
    res.status(201).json({ images: created.map(publicImage) });
  }),
);

router.delete(
  "/images/:id",
  asyncHandler(async (req, res) => {
    const image = await prisma.lotImage.findUnique({ where: { id: req.params.id } });
    if (!image) throw notFound("Image not found");
    await prisma.lotImage.delete({ where: { id: image.id } });
    if (image.provider === "CLOUDINARY" && image.publicId) await destroyImage(image.publicId);
    res.status(204).end();
  }),
);

export default router;
