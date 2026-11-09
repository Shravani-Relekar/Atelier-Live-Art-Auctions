import type { Artist, Auction, Bid, Lot, LotImage, User } from "@prisma/client";
import { nextMinBid } from "./increments";
import { paddleFor } from "./paddle";
import { env } from "../config/env";

export function publicUser(u: Pick<User, "id" | "email" | "name" | "role" | "phone" | "country" | "createdAt">) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone,
    country: u.country,
    paddle: paddleFor(u.id),
    createdAt: u.createdAt,
  };
}

export function publicImage(img: LotImage) {
  return {
    id: img.id,
    provider: img.provider,
    publicId: img.publicId,
    url: img.url,
    width: img.width,
    height: img.height,
    alt: img.alt,
    position: img.position,
  };
}

export function publicBid(b: Bid) {
  return {
    id: b.id,
    lotId: b.lotId,
    amount: b.amount,
    isProxy: b.isProxy,
    bidderId: b.userId,
    paddle: paddleFor(b.userId),
    createdAt: b.createdAt,
  };
}

/** Live-changing fields of a lot. Broadcast over sockets on every state change. */
export function lotState(lot: Lot) {
  return {
    id: lot.id,
    auctionId: lot.auctionId,
    status: lot.status,
    currentBid: lot.currentBid,
    bidCount: lot.bidCount,
    highestBidderId: lot.highestBidderId,
    highestBidderPaddle: paddleFor(lot.highestBidderId),
    nextMinBid: nextMinBid(lot.currentBid, lot.startingBid),
    hasReserve: lot.reservePrice != null,
    // The reserve amount itself is never disclosed; only whether it has been met.
    reserveMet: lot.reservePrice == null ? lot.currentBid != null : (lot.currentBid ?? 0) >= lot.reservePrice,
    startsAt: lot.startsAt,
    endsAt: lot.endsAt,
    extensionCount: lot.extensionCount,
    closedAt: lot.closedAt,
    version: lot.version,
  };
}

type LotWithRelations = Lot & {
  artist?: Artist | null;
  images?: LotImage[];
  auction?: Pick<Auction, "id" | "slug" | "title" | "currency" | "status"> | null;
};

export function publicLot(lot: LotWithRelations) {
  return {
    ...lotState(lot),
    lotNumber: lot.lotNumber,
    title: lot.title,
    year: lot.year,
    medium: lot.medium,
    dimensions: lot.dimensions,
    signature: lot.signature,
    description: lot.description,
    provenance: lot.provenance,
    estimateLow: lot.estimateLow,
    estimateHigh: lot.estimateHigh,
    startingBid: lot.startingBid,
    artist: lot.artist ? publicArtist(lot.artist) : undefined,
    images: lot.images?.map(publicImage),
    auction: lot.auction
      ? { id: lot.auction.id, slug: lot.auction.slug, title: lot.auction.title, currency: lot.auction.currency, status: lot.auction.status }
      : undefined,
  };
}

export function publicArtist(a: Artist) {
  return { id: a.id, slug: a.slug, name: a.name, born: a.born, died: a.died, country: a.country, bio: a.bio, portrait: a.portrait };
}

export function publicAuction(a: Auction) {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    subtitle: a.subtitle,
    description: a.description,
    currency: a.currency,
    coverImage: a.coverImage,
    status: a.status,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    lotIntervalSeconds: a.lotIntervalSeconds,
  };
}

export const auctionRules = () => ({
  buyersPremiumPercent: env.BUYERS_PREMIUM_PERCENT,
  softCloseWindowSeconds: env.SOFT_CLOSE_WINDOW_SECONDS,
  softCloseExtensionSeconds: env.SOFT_CLOSE_EXTENSION_SECONDS,
});
