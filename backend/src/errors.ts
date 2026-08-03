import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/**
 * Domain error carrying an HTTP status. Anything the routes want the client
 * to see verbatim is thrown as one of these; everything else is treated as
 * an internal error and hidden behind a generic message.
 */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export const badRequest = (code = "bad_request", message?: string) => new HttpError(400, code, message);
export const unauthorized = (code = "unauthorized") => new HttpError(401, code);
export const forbidden = (code = "forbidden") => new HttpError(403, code);
export const notFound = (code = "not_found") => new HttpError(404, code);
export const conflict = (code = "conflict") => new HttpError(409, code);

/**
 * Centralised error handler. All route errors flow here so responses have
 * one consistent shape. Zod and Prisma errors are recognised and translated
 * to the appropriate 4xx status; anything else becomes a 500 with the
 * details hidden from the client and logged server-side.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }

  if (err instanceof ZodError) {
    // Aggregate field errors so the client can highlight individual inputs.
    return res.status(400).json({
      error: "validation_failed",
      issues: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025 = record not found on update/delete, P2002 = unique violation.
    if (err.code === "P2025") return res.status(404).json({ error: "not_found" });
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? err.meta?.target.join(", ") : String(err.meta?.target ?? "");
      return res.status(409).json({ error: "unique_violation", field: target });
    }
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_error" });
}

/**
 * Wraps an async route handler so a rejected promise reaches errorHandler
 * — Express 4 doesn't await route handlers on its own, and unhandled
 * rejections would crash the process instead of returning 500.
 */
export const asyncHandler =
  <TReq extends Request = Request>(handler: (req: TReq, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as TReq, res, next)).catch(next);
  };
