import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { badRequest } from "../lib/errors";

type Source = "body" | "query" | "params";

/** Validates and replaces req[source] with the parsed (coerced, stripped) value. */
export function validate<S extends ZodTypeAny>(schema: S, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(badRequest("Validation failed", "VALIDATION_ERROR", result.error.flatten()));
    }
    (req as unknown as Record<Source, z.infer<S>>)[source] = result.data;
    next();
  };
}

/** Wraps async route handlers so rejected promises reach the error middleware. */
export const asyncHandler =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req as R, res, next).catch(next);
  };
