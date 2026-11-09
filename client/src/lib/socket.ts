import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./api";

let socket: Socket | null = null;
const lotRefs = new Map<string, number>();
const auctionRefs = new Map<string, number>();

/** Offset (ms) to add to Date.now() to get server time. Updated by NTP-style sync. */
let clockOffset = 0;
const offsetListeners = new Set<() => void>();

export function serverNow() {
  return Date.now() + clockOffset;
}
export function onClockOffset(cb: () => void) {
  offsetListeners.add(cb);
  return () => offsetListeners.delete(cb);
}
export function seedClockOffset(serverTime: number) {
  // Coarse first estimate from an HTTP response; refined by socket sync.
  if (clockOffset === 0) clockOffset = serverTime - Date.now();
}

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_BASE || undefined, {
    withCredentials: true, // sends the HttpOnly auth cookie in the handshake
    transports: ["websocket", "polling"],
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  socket.on("connect", () => {
    // Re-join every room after (re)connect.
    for (const id of lotRefs.keys()) socket!.emit("lot:join", id);
    for (const id of auctionRefs.keys()) socket!.emit("auction:join", id);
    void syncClock();
  });
  setInterval(() => void syncClock(), 60_000);
  return socket;
}

/** Reconnect so the handshake picks up a new/removed auth cookie after login or logout. */
export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

async function syncClock() {
  if (!socket?.connected) return;
  const samples: Array<{ offset: number; rtt: number }> = [];
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    const res = await new Promise<{ serverTime: number } | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 3000);
      socket!.emit("time:sync", t0, (r: { serverTime: number }) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    if (!res) continue;
    const t1 = Date.now();
    samples.push({ rtt: t1 - t0, offset: res.serverTime - (t0 + (t1 - t0) / 2) });
  }
  if (samples.length === 0) return;
  // The lowest-latency sample has the least asymmetric-delay error.
  samples.sort((a, b) => a.rtt - b.rtt);
  clockOffset = samples[0].offset;
  offsetListeners.forEach((cb) => cb());
}

function refJoin(map: Map<string, number>, id: string, event: string) {
  const n = map.get(id) ?? 0;
  map.set(id, n + 1);
  if (n === 0) getSocket().emit(event, id);
}
function refLeave(map: Map<string, number>, id: string, event: string) {
  const n = map.get(id) ?? 0;
  if (n <= 1) {
    map.delete(id);
    socket?.emit(event, id);
  } else map.set(id, n - 1);
}

export const subscribeLot = (id: string) => {
  refJoin(lotRefs, id, "lot:join");
  return () => refLeave(lotRefs, id, "lot:leave");
};
export const subscribeAuction = (id: string) => {
  refJoin(auctionRefs, id, "auction:join");
  return () => refLeave(auctionRefs, id, "auction:leave");
};
