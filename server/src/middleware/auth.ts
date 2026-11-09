import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env, isProd } from "../config/env";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  role: Role;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role } satisfies Omit<TokenPayload, "sub">, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & TokenPayload;
    if (!p.sub) return null;
    return { id: p.sub, role: p.role };
  } catch {
    return null;
  }
}

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function setAuthCookie(res: Response, token: string) {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(env.COOKIE_NAME, { httpOnly: true, secure: isProd, sameSite: isProd ? "none" : "lax", path: "/" });
}

/** Reads the JWT from the HttpOnly cookie, falling back to an `Authorization: Bearer` header. */
export function extractToken(req: Request): string | null {
  const fromCookie = req.cookies?.[env.COOKIE_NAME];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) req.user = verifyToken(token) ?? undefined;
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  const user = token ? verifyToken(token) : null;
  if (!user) return next(unauthorized());
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.user?.role !== "ADMIN") return next(forbidden("Administrator access required"));
    next();
  });
}
