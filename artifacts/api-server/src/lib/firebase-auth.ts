import type { Request, Response } from "express";
import { verifyAdminIdToken } from "./firebase-admin";

export function bearerToken(req: Request): string | null {
  const header = req.get("authorization");
  return header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim() || null
    : null;
}

export async function requireAdmin(
  req: Request,
  res: Response,
): Promise<{ uid: string; email?: string } | null> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "A Firebase ID token is required." });
    return null;
  }

  try {
    return await verifyAdminIdToken(token);
  } catch (error: unknown) {
    req.log.warn({ err: error }, "Admin Firebase token verification failed");
    res.status(401).json({ error: "The Firebase ID token is invalid or expired." });
    return null;
  }
}