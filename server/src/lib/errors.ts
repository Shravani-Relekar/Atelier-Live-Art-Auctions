export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code = "BAD_REQUEST", details?: unknown) =>
  new HttpError(400, msg, code, details);
export const unauthorized = (msg = "Authentication required") => new HttpError(401, msg, "UNAUTHORIZED");
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg, "FORBIDDEN");
export const notFound = (msg = "Not found") => new HttpError(404, msg, "NOT_FOUND");
export const conflict = (msg: string, code = "CONFLICT", details?: unknown) =>
  new HttpError(409, msg, code, details);
