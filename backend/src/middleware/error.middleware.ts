import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error("Unhandled API error:", err);
  if (!res.headersSent) {
    const message =
      err instanceof Error && /E11000 duplicate key/.test(err.message)
        ? "Could not complete sign-in. Please try again or contact support."
        : err instanceof Error
          ? err.message
          : "Internal server error";
    res.status(500).json({ error: message });
  }
}
