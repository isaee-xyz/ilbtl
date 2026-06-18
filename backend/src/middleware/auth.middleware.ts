import type { Request, Response, NextFunction } from "express";
import { getUserByFirebaseUid } from "../services/lead.service.js";
import { getAuthClient } from "../config/firebase.js";
import type { UserRecord } from "../types/index.js";

/**
 * Demo (`demo:<uid>`) tokens bypass signature verification, so they must NEVER
 * be accepted in production — otherwise anyone could impersonate any user by
 * sending `demo:<their_firebase_uid>`. Allowed only in non-production, or when
 * explicitly opted in via ALLOW_DEMO_AUTH=true.
 */
export function isDemoAuthAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEMO_AUTH === "true"
  );
}

export async function resolveUser(req: Request): Promise<UserRecord | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  if (token.startsWith("demo:")) {
    if (!isDemoAuthAllowed()) return null;
    return getUserByFirebaseUid(token.slice(5));
  }

  // Real Firebase ID token — verify signature/expiry before trusting any claim.
  try {
    const decoded = await getAuthClient().verifyIdToken(token);
    return getUserByFirebaseUid(decoded.uid);
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.locals.user = user;
  return next();
}
