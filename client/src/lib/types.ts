export type Role = "BIDDER" | "ADMIN";
export type AuctionStatus = "DRAFT" | "UPCOMING" | "LIVE" | "CLOSED";
export type LotStatus = "UPCOMING" | "LIVE" | "SOLD" | "PASSED" | "WITHDRAWN";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
  country: string | null;
  paddle: number;
  createdAt: string;
}

export interface LotImage {
  id?: string;
  provider: "CLOUDINARY" | "EXTERNAL";
  publicId: string | null;
  url: string;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  position?: number;
}

export interface Artist {
  id: string;
  slug: string;
  name: string;
  born: number | null;
  died: number | null;
  country: string | null;
  bio: string | null;
  portrait: string | null;
}

/** Fields that change in real time and arrive over the socket. */
export interface LotState {
  id: string;
  auctionId: string;
  status: LotStatus;
  currentBid: number | null;
  bidCount: number;
  highestBidderId: string | null;
  highestBidderPaddle: number | null;
  nextMinBid: number;
  hasReserve: boolean;
  reserveMet: boolean;
  startsAt: string;
  endsAt: string;
  extensionCount: number;
  closedAt: string | null;
  version: number;
}

export interface Lot extends LotState {
  lotNumber: number;
  title: string;
  year: string | null;
  medium: string | null;
  dimensions: string | null;
  signature: string | null;
  description: string | null;
  provenance: string | null;
  estimateLow: number;
  estimateHigh: number;
  startingBid: number;
  artist?: Artist;
  images?: LotImage[];
  auction?: { id: string; slug: string; title: string; currency: string; status: AuctionStatus };
  reservePrice?: number | null;
}

export interface Bid {
  id: string;
  lotId: string;
  amount: number;
  isProxy: boolean;
  bidderId: string;
  paddle: number;
  createdAt: string;
}

export interface Auction {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  currency: string;
  coverImage: string | null;
  status: AuctionStatus;
  startsAt: string;
  endsAt: string;
  lotIntervalSeconds: number;
}

export interface AuctionSummary extends Auction {
  lotCount: number;
  previewImages: LotImage[];
  soldTotal: number;
  soldCount: number;
}

export interface AppConfig {
  cloudinary: { enabled: boolean; cloudName: string | null };
  rules: { buyersPremiumPercent: number; softCloseWindowSeconds: number; softCloseExtensionSeconds: number };
  serverTime: number;
}

export interface LotDetailResponse {
  lot: Lot;
  bids: Bid[];
  prevLotId: string | null;
  nextLotId: string | null;
  viewer: { isWatching: boolean; maxBid: number | null } | null;
  serverTime: number;
}

export interface BidEvent {
  lot: LotState;
  bids: Bid[];
  extended: boolean;
}

export type Standing = "LEADING" | "OUTBID" | "WON" | "LOST" | "RESERVE_NOT_MET";

export interface MyBidItem {
  lot: Lot;
  myTopBid: number;
  myBidCount: number;
  myMaxBid: number | null;
  lastBidAt: string;
  standing: Standing;
}
