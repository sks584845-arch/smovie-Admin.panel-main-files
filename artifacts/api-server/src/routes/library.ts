import { Router, type IRouter } from "express";
import {
  readAdminLibrary,
  readPublicLibrary,
  verifyAdminIdToken,
  writeAdminLibrary,
  type LibraryState,
} from "../lib/firebase-admin";
import { hasValidClientApiKey } from "../lib/api-key";
import { requireAdmin } from "../lib/firebase-auth";

const router: IRouter = Router();

function normalizeState(body: unknown): LibraryState {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  const categories = Array.isArray(input.categories)
    ? input.categories.filter((item): item is string => typeof item === "string")
    : [];
  const metadata = input.metadata && typeof input.metadata === "object"
    ? input.metadata as Record<string, unknown>
    : {};

  return { items, categories, metadata, updatedAt: new Date().toISOString() };
}

router.get("/admin/library", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const state = await readAdminLibrary(admin.uid);
    res.json(state ?? { items: [], categories: [], metadata: {}, updatedAt: new Date().toISOString() });
  } catch (error: unknown) {
    req.log.error({ err: error, uid: admin.uid }, "Admin library restore failed");
    res.status(503).json({ error: "Cloud library restore is unavailable." });
  }
});

router.put("/admin/library", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const state = await writeAdminLibrary(admin.uid, normalizeState(req.body));
    res.json(state);
  } catch (error: unknown) {
    req.log.error({ err: error, uid: admin.uid }, "Admin library sync failed");
    res.status(503).json({ error: "Cloud library sync is unavailable." });
  }
});

router.get("/client/library", async (req, res): Promise<void> => {
  if (!hasValidClientApiKey(req)) {
    res.status(401).json({ error: "A valid x-api-key header is required." });
    return;
  }

  try {
    res.json(await readPublicLibrary());
  } catch (error: unknown) {
    req.log.error({ err: error }, "Public library restore failed");
    res.status(503).json({ error: "The client library is temporarily unavailable." });
  }
});

export default router;