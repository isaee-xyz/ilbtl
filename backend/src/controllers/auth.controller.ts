import type { Request, Response } from "express";
import { getLeadSummary, getUserByFirebaseUid, upsertUser } from "../services/lead.service.js";
import { applyUserLoginLocation } from "../services/location.service.js";
import { parseLoginLocationBody } from "../utils/validators.js";
import { authPayload } from "../views/api.view.js";

async function handleLoginLocation(
  req: Request,
  user: { id: string; firebase_uid: string },
) {
  const parsed = parseLoginLocationBody(req.body);
  if (typeof parsed === "string") {
    throw new Error(parsed);
  }
  if (parsed) {
    await applyUserLoginLocation(user.id, parsed);
  }
}

export async function syncAuth(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = authHeader.slice(7);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    const uid = payload.user_id ?? payload.sub;
    const email = payload.email;
    if (!uid || !email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let user = await upsertUser({
      firebase_uid: uid,
      email,
      full_name: payload.name ?? email.split("@")[0],
      photo_url: payload.picture ?? null,
    });

    try {
      await handleLoginLocation(req, user);
      const refreshed = await getUserByFirebaseUid(uid);
      if (refreshed) user = refreshed;
    } catch (e) {
      return res.status(400).json({
        error: e instanceof Error ? e.message : "Invalid location data",
      });
    }

    const summary = await getLeadSummary(user.id);
    return res.json(authPayload(user, summary));
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (/E11000 duplicate key/.test(message)) {
      console.error("syncAuth duplicate key (scout_ref index):", e);
      return res.status(503).json({
        error:
          "Sign-in is temporarily unavailable. Please try again in a minute or contact support.",
      });
    }
    if (message) console.error("syncAuth failed:", e);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export async function getMe(_req: Request, res: Response) {
  const user = res.locals.user;
  const summary = await getLeadSummary(user.id);
  return res.json(authPayload(user, summary));
}

export async function demoLogin(req: Request, res: Response) {
  try {
    let user = await upsertUser({
      firebase_uid: "demo-volunteer-001",
      email: "demo.runner@infinitylearn.com",
      full_name: "Demo Volunteer",
      photo_url: null,
    });

    try {
      await handleLoginLocation(req, user);
      const refreshed = await getUserByFirebaseUid(user.firebase_uid);
      if (refreshed) user = refreshed;
    } catch (e) {
      return res.status(400).json({
        error: e instanceof Error ? e.message : "Invalid location data",
      });
    }

    const summary = await getLeadSummary(user.id);
    return res.json(authPayload(user, summary));
  } catch (err) {
    console.error("Demo login failed:", err);
    return res.status(500).json({
      error: "Demo sign-in failed. Please try again.",
    });
  }
}
