import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, validate } from "../middleware/validate";
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from "../middleware/auth";
import { conflict, notFound, unauthorized } from "../lib/errors";
import { publicUser } from "../lib/serializers";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Password must contain a letter")
    .regex(/[0-9]/, "Password must contain a number"),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(60).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

const BCRYPT_ROUNDS = 12;
// Pre-computed hash used to keep login timing constant when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

router.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof registerSchema>;
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict("An account with this email already exists", "EMAIL_TAKEN");
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        country: body.country,
        passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      },
    });
    const token = signToken({ id: user.id, role: user.role });
    setAuthCookie(res, token);
    res.status(201).json({ user: publicUser(user), token });
  }),
);

router.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw unauthorized("Invalid email or password");
    const token = signToken({ id: user.id, role: user.role });
    setAuthCookie(res, token);
    res.json({ user: publicUser(user), token });
  }),
);

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw notFound("User not found");
    res.json({ user: publicUser(user) });
  }),
);

export default router;
