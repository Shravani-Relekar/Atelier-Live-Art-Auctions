/* eslint-disable no-console */
/**
 * Fires N simultaneous bids at the same minimum amount against one live lot, from several
 * accounts, and checks that exactly one bid wins that amount and the lot state is consistent.
 *
 *   npm run test:concurrency -w server -- [lotId] [parallelism]
 *
 * Requires the server running on API_URL (default http://localhost:4000) and seeded users.
 */
import { PrismaClient } from "@prisma/client";

const API = process.env.API_URL ?? "http://localhost:4000";
const prisma = new PrismaClient();
const USERS = ["asha@atelier.test", "rohan@atelier.test", "clara@atelier.test", "omar@atelier.test"];

async function login(email: string): Promise<string> {
  const r = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Bidder@123" }),
  });
  if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
  return ((await r.json()) as { token: string }).token;
}

async function main() {
  const lotId = process.argv[2] ?? (await prisma.lot.findFirst({ where: { status: "LIVE" }, orderBy: { endsAt: "desc" } }))?.id;
  const parallel = Number(process.argv[3] ?? 40);
  if (!lotId) throw new Error("No live lot found");

  const tokens = await Promise.all(USERS.map(login));
  const before = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
  const detail = (await (await fetch(`${API}/api/lots/${lotId}`)).json()) as { lot: { nextMinBid: number; highestBidderId: string | null } };
  const amount = detail.lot.nextMinBid;
  console.log(`Lot ${lotId}: current=${before.currentBid} next=${amount}. Firing ${parallel} bids at once…`);

  const results = await Promise.all(
    Array.from({ length: parallel }, (_, i) =>
      fetch(`${API}/api/lots/${lotId}/bids`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${tokens[i % tokens.length]}` },
        body: JSON.stringify({ amount }),
      }).then(async (r) => ({ status: r.status, body: (await r.json().catch(() => ({}))) as { error?: { code: string } } })),
    ),
  );

  const tally = results.reduce<Record<string, number>>((acc, r) => {
    const k = r.status === 201 ? "201 accepted" : `${r.status} ${r.body.error?.code ?? ""}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.table(tally);

  const after = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
  const atAmount = await prisma.bid.count({ where: { lotId, amount } });
  const total = await prisma.bid.count({ where: { lotId } });
  const top = await prisma.bid.findFirst({ where: { lotId }, orderBy: { amount: "desc" } });
  const accepted = results.filter((r) => r.status === 201).length;

  const checks = {
    "exactly one bid recorded at contested amount": atAmount === 1,
    "exactly one request accepted": accepted === 1,
    "lot.currentBid equals top bid": after.currentBid === top?.amount,
    "lot.highestBidderId equals top bidder": after.highestBidderId === top?.userId,
    "lot.bidCount equals bid rows": after.bidCount === total,
  };
  console.table(checks);
  const ok = Object.values(checks).every(Boolean);
  console.log(ok ? "PASS" : "FAIL");
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
