import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { lotState } from "../lib/serializers";
import { getIO, rooms } from "../socket";

const TICK_MS = 1_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Drives the auction lifecycle: opens lots at their start time and hammers them down at their
 * (possibly soft-close-extended) end time. Every transition is a conditional UPDATE / row-locked
 * transaction, so running several server instances is safe — exactly one wins each transition.
 */
export function startScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    tick()
      .catch((err) => console.error("[scheduler]", err))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick() {
  await openDueLots();
  await closeDueLots();
  await syncAuctionStatuses();
}

async function openDueLots() {
  const opened = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "Lot" SET status = 'LIVE', version = version + 1, "updatedAt" = now()
    WHERE status = 'UPCOMING' AND "startsAt" <= now() AND "endsAt" > now()
      AND "auctionId" IN (SELECT id FROM "Auction" WHERE status <> 'DRAFT')
    RETURNING id`;
  if (opened.length === 0) return;
  const lots = await prisma.lot.findMany({ where: { id: { in: opened.map((l) => l.id) } } });
  const io = getIO();
  for (const lot of lots) {
    io.to(rooms.lot(lot.id)).to(rooms.auction(lot.auctionId)).emit("lot:update", { lot: lotState(lot) });
  }
}

async function closeDueLots() {
  // Lots whose window lapsed before they ever opened (e.g. server was down) are closed too.
  const due = await prisma.lot.findMany({
    where: { status: { in: ["LIVE", "UPCOMING"] }, endsAt: { lte: new Date() }, auction: { status: { not: "DRAFT" } } },
    select: { id: true },
    orderBy: { endsAt: "asc" },
    take: 100,
  });
  for (const { id } of due) {
    try {
      const closed = await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Lot" WHERE id = ${id} FOR UPDATE`;
          const lot = await tx.lot.findUniqueOrThrow({ where: { id } });
          // Re-check under the lock: a last-second bid may have extended the close.
          if (!["LIVE", "UPCOMING"].includes(lot.status) || lot.endsAt > new Date()) return null;
          const sold = lot.currentBid != null && (lot.reservePrice == null || lot.currentBid >= lot.reservePrice);
          return tx.lot.update({
            where: { id },
            data: { status: sold ? "SOLD" : "PASSED", closedAt: new Date(), version: { increment: 1 } },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
      );
      if (!closed) continue;
      const io = getIO();
      const payload = { lot: lotState(closed) };
      io.to(rooms.lot(closed.id)).to(rooms.auction(closed.auctionId)).emit("lot:closed", payload);
      if (closed.status === "SOLD" && closed.highestBidderId) {
        io.to(rooms.user(closed.highestBidderId)).emit("user:won", { lotId: closed.id, amount: closed.currentBid });
      }
    } catch (err) {
      console.error(`[scheduler] failed to close lot ${id}`, err);
    }
  }
}

async function syncAuctionStatuses() {
  const now = new Date();
  const toLive = await prisma.auction.findMany({
    where: { status: "UPCOMING", startsAt: { lte: now } },
    select: { id: true },
  });
  const toClose = await prisma.auction.findMany({
    where: { status: { in: ["LIVE", "UPCOMING"] }, startsAt: { lte: now }, lots: { none: { status: { in: ["LIVE", "UPCOMING"] } } } },
    select: { id: true },
  });
  const closeIds = new Set(toClose.map((a) => a.id));
  const liveIds = toLive.map((a) => a.id).filter((id) => !closeIds.has(id));
  if (liveIds.length) await prisma.auction.updateMany({ where: { id: { in: liveIds }, status: "UPCOMING" }, data: { status: "LIVE" } });
  if (closeIds.size) await prisma.auction.updateMany({ where: { id: { in: [...closeIds] } }, data: { status: "CLOSED" } });
  const io = getIO();
  for (const id of [...liveIds, ...closeIds]) {
    io.to(rooms.auction(id)).to(rooms.lobby).emit("auction:update", { auctionId: id, status: closeIds.has(id) ? "CLOSED" : "LIVE" });
  }
}
