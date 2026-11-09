import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { parse as parseCookie } from "cookie";
import { clientOrigins, env } from "../config/env";
import { verifyToken, type AuthUser } from "../middleware/auth";

export const rooms = {
  lot: (id: string) => `lot:${id}`,
  auction: (id: string) => `auction:${id}`,
  user: (id: string) => `user:${id}`,
  lobby: "lobby",
};

let io: Server | null = null;

export function getIO(): Server {
  if (!io) throw new Error("Socket.io has not been initialised");
  return io;
}

const ID_RE = /^[a-z0-9]{10,40}$/i;

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: clientOrigins, credentials: true },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  // Authentication is optional: anonymous visitors can watch live lots, only bidding needs a user.
  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? "");
    const token = (socket.handshake.auth?.token as string | undefined) ?? cookies[env.COOKIE_NAME];
    const user = token ? verifyToken(token) : null;
    socket.data.user = user ?? undefined;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as AuthUser | undefined;
    if (user) socket.join(rooms.user(user.id));
    socket.join(rooms.lobby);

    socket.on("lot:join", (lotId: unknown) => {
      if (typeof lotId === "string" && ID_RE.test(lotId)) socket.join(rooms.lot(lotId));
    });
    socket.on("lot:leave", (lotId: unknown) => {
      if (typeof lotId === "string") socket.leave(rooms.lot(lotId));
    });
    socket.on("auction:join", (auctionId: unknown) => {
      if (typeof auctionId === "string" && ID_RE.test(auctionId)) socket.join(rooms.auction(auctionId));
    });
    socket.on("auction:leave", (auctionId: unknown) => {
      if (typeof auctionId === "string") socket.leave(rooms.auction(auctionId));
    });

    // NTP-style clock sync so every client's countdown agrees with the server, not the local clock.
    socket.on("time:sync", (clientSent: unknown, ack?: (r: { clientSent: unknown; serverTime: number }) => void) => {
      if (typeof ack === "function") ack({ clientSent, serverTime: Date.now() });
    });
  });

  return io;
}
