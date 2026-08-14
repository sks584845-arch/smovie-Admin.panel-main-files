import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export function hasValidClientApiKey(req: Request): boolean {
  const configured = process.env.CLIENT_API_KEY;
  const supplied = req.get("x-api-key");
  if (!configured || !supplied) return false;

  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(supplied, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}