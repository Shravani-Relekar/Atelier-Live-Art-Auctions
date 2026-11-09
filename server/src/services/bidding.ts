import { Prisma, type Bid, type Lot } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { badRequest, conflict, HttpError, notFound } from "../lib/errors";
import { incrementFor, MAX_BID_AMOUNT, nextMinBid } from "../lib/increments";
import { lotState, publicBid } from "../lib/serializers";
import { getIO, rooms } from "../socket";

export interface PlaceBidInput {
  userId: string;
  lotId: string;
  amount: number;
  /** Optional proxy ceiling: the engine bids on the user's behalf up to this amount. */
  maxAmount?: number;
}

export interface PlaceBidResult {
  lot: Lot;
  bids: Bid[];
  /** Users who held the lead before this call and no longer do. */
  outbidUserIds: string[];
  extended: boolean;
  /** True when the caller only raised their proxy ceiling while already leading. */
  proxyOnly: boolean;
}

interface PendingBid {
  userId: string;
  amount: number;
  isProxy: boolean;
}

const MAX_TX_ATTEMPTS = 5;
const MAX_PROXY_ROUNDS = 200;

/**
 * Places a bid atomically.
 *
 * Concurrency strategy (defence in depth):
 *  1. SERIALIZABLE transaction isolation.
 *  2. `SELECT ... FOR UPDATE` on the lot row, so concurrent bidders on one lot queue on a row
 *     lock instead of racing; bidders on different lots never block each other.
 *  3. `@@unique([lotId, amount])` on Bid, so two equal bids can never both be recorded.
 *  4. A version counter on Lot that is bumped on every write.
 * Serialization failures / deadlocks are retried with jittered backoff.
 */
export async function placeBid(input: PlaceBidInput): Promise<PlaceBidResult> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
    try {
      const result = await prisma.$transaction((tx) => placeBidTx(tx, input), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
      broadcastBidResult(result);
      return result;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_TX_ATTEMPTS) break;
      await sleep(15 * attempt + Math.random() * 40);
    }
  }
  if (lastErr instanceof HttpError) throw lastErr;
  if (isRetryable(lastErr)) {
    throw conflict("The lot is receiving heavy bidding. Please try again.", "BID_CONTENTION");
  }
  throw lastErr;
}

async function placeBidTx(tx: Prisma.TransactionClient, { userId, lotId, amount, maxAmount }: PlaceBidInput) {
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_BID_AMOUNT) throw badRequest("Invalid bid amount");
  if (maxAmount != null && (!Number.isInteger(maxAmount) || maxAmount < amount || maxAmount > MAX_BID_AMOUNT)) {
    throw badRequest("Maximum bid must be a whole number at least equal to your bid", "INVALID_MAX_BID");
  }

  // Row-level lock: every other bid on this lot waits here until we commit or roll back.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Lot" WHERE id = ${lotId} FOR UPDATE`;
  if (locked.length === 0) throw notFound("Lot not found");
  const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });

  const now = new Date();
  if (lot.status !== "LIVE") throw conflict(`Bidding is not open for this lot (status: ${lot.status})`, "LOT_NOT_LIVE");
  if (now < lot.startsAt) throw conflict("Bidding has not started yet", "LOT_NOT_STARTED");
  if (now >= lot.endsAt) throw conflict("Bidding for this lot has closed", "LOT_CLOSED");

  const minimum = nextMinBid(lot.currentBid, lot.startingBid);
  const previousLeader = lot.highestBidderId;

  // Leader raising their own proxy ceiling: record it without bidding against themselves.
  if (previousLeader === userId) {
    if (maxAmount == null) throw conflict("You are already the highest bidder", "ALREADY_LEADING");
    if (maxAmount < minimum) throw badRequest(`Maximum bid must be at least ${minimum}`, "BID_TOO_LOW", { minimum });
    await tx.autoBid.upsert({
      where: { lotId_userId: { lotId, userId } },
      create: { lotId, userId, maxAmount },
      update: { maxAmount },
    });
    const updated = await tx.lot.update({ where: { id: lotId }, data: { version: { increment: 1 } } });
    return { lot: updated, bids: [], outbidUserIds: [], extended: false, proxyOnly: true } satisfies PlaceBidResult;
  }

  if (amount < minimum) {
    throw badRequest(`Bid must be at least ${minimum}`, "BID_TOO_LOW", { minimum, currentBid: lot.currentBid });
  }

  if (maxAmount != null) {
    await tx.autoBid.upsert({
      where: { lotId_userId: { lotId, userId } },
      create: { lotId, userId, maxAmount },
      update: { maxAmount },
    });
  }

  const autoBids = await tx.autoBid.findMany({
    where: { lotId },
    orderBy: [{ maxAmount: "desc" }, { createdAt: "asc" }],
  });

  const pending: PendingBid[] = [{ userId, amount, isProxy: false }];
  let price = amount;
  let leader = userId;
  const leaders = new Set<string>([userId]);
  const exhausted = new Set<string>();

  // Proxy resolution: competing max-bids fight it out one increment above each other,
  // exactly as an auctioneer would execute absentee bids on the floor.
  for (let round = 0; round < MAX_PROXY_ROUNDS; round++) {
    const next = price + incrementFor(price);
    const leaderAuto = autoBids.find((a) => a.userId === leader);
    const leaderMax = Math.max(leaderAuto?.maxAmount ?? price, price);
    const challenger = autoBids.find((a) => a.userId !== leader && !exhausted.has(a.userId) && a.maxAmount >= next);
    if (!challenger) break;

    if (challenger.maxAmount > leaderMax) {
      // Leader's proxy is spent up to its ceiling, then the challenger tops it by one increment.
      if (leaderMax > price) {
        pending.push({ userId: leader, amount: leaderMax, isProxy: true });
        price = leaderMax;
      }
      const beat = price + incrementFor(price);
      if (challenger.maxAmount < beat) {
        // Ceiling is above the leader's but not by a full increment: leader holds.
        exhausted.add(challenger.userId);
        continue;
      }
      pending.push({ userId: challenger.userId, amount: beat, isProxy: true });
      price = beat;
      exhausted.add(leader);
      leader = challenger.userId;
      leaders.add(leader);
    } else if (challenger.maxAmount === leaderMax) {
      // Tie on ceilings: the earlier instruction wins, as in a saleroom.
      const leaderFirst = leaderAuto != null && leaderAuto.createdAt <= challenger.createdAt;
      if (leaderFirst) {
        pending.push({ userId: leader, amount: leaderMax, isProxy: true });
        exhausted.add(challenger.userId);
      } else {
        pending.push({ userId: challenger.userId, amount: challenger.maxAmount, isProxy: true });
        exhausted.add(leader);
        leader = challenger.userId;
        leaders.add(leader);
      }
      price = leaderMax;
    } else {
      // Challenger's ceiling is below the leader's: it bids its max, the leader answers one step up.
      pending.push({ userId: challenger.userId, amount: challenger.maxAmount, isProxy: true });
      leaders.add(challenger.userId);
      price = challenger.maxAmount;
      const reply = Math.min(leaderMax, price + incrementFor(price));
      pending.push({ userId: leader, amount: reply, isProxy: true });
      price = reply;
      exhausted.add(challenger.userId);
    }
  }

  // Persist bids in order with strictly increasing timestamps so history reads correctly.
  const baseTs = now.getTime();
  const bids: Bid[] = [];
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    bids.push(
      await tx.bid.create({
        data: { lotId, userId: p.userId, amount: p.amount, isProxy: p.isProxy, createdAt: new Date(baseTs + i) },
      }),
    );
  }

  // Soft close ("anti-sniping"): a bid in the final window pushes the close out.
  const msLeft = lot.endsAt.getTime() - now.getTime();
  const extended = msLeft <= env.SOFT_CLOSE_WINDOW_SECONDS * 1000;
  const newEndsAt = extended ? new Date(Math.max(lot.endsAt.getTime(), baseTs + env.SOFT_CLOSE_EXTENSION_SECONDS * 1000)) : lot.endsAt;

  // Optimistic guard on top of the row lock: fails loudly if anything else touched the row.
  const updatedCount = await tx.lot.updateMany({
    where: { id: lotId, version: lot.version },
    data: {
      currentBid: price,
      highestBidderId: leader,
      bidCount: { increment: bids.length },
      endsAt: newEndsAt,
      extensionCount: extended ? { increment: 1 } : undefined,
      version: { increment: 1 },
    },
  });
  if (updatedCount.count !== 1) {
    throw new Prisma.PrismaClientKnownRequestError("Lot version changed during bid", { code: "P2034", clientVersion: Prisma.prismaVersion.client });
  }
  const updated = await tx.lot.findUniqueOrThrow({ where: { id: lotId } });

  const outbid = new Set<string>(leaders);
  if (previousLeader) outbid.add(previousLeader);
  outbid.delete(leader);

  return { lot: updated, bids, outbidUserIds: [...outbid], extended, proxyOnly: false } satisfies PlaceBidResult;
}

function broadcastBidResult(r: PlaceBidResult) {
  if (r.proxyOnly) return;
  const io = getIO();
  const payload = { lot: lotState(r.lot), bids: r.bids.map(publicBid), extended: r.extended };
  io.to(rooms.lot(r.lot.id)).to(rooms.auction(r.lot.auctionId)).emit("lot:bid", payload);
  for (const uid of r.outbidUserIds) {
    io.to(rooms.user(uid)).emit("user:outbid", {
      lotId: r.lot.id,
      auctionId: r.lot.auctionId,
      currentBid: r.lot.currentBid,
      nextMinBid: nextMinBid(r.lot.currentBid, r.lot.startingBid),
    });
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2034") return true; // write conflict / deadlock
    if (err.code === "P2002") return true; // unique (lotId, amount) collision - re-evaluate against fresh state
    if (err.code === "P2010") {
      const code = (err.meta as { code?: string } | undefined)?.code;
      return code === "40001" || code === "40P01";
    }
  }
  const msg = (err as Error)?.message ?? "";
  return /could not serialize access|deadlock detected|40001|40P01/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
