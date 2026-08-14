import { Router, type IRouter } from "express";
import {
  deleteMedia,
  importRemoteMedia,
  mediaResponse,
  mediaUpload,
  streamMedia,
} from "../lib/media-storage";
import { deleteMediaMetadata, saveMediaMetadata } from "../lib/firebase-admin";
import { requireAdmin } from "../lib/firebase-auth";

const router: IRouter = Router();

router.post("/media/upload", async (req, res, next): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  mediaUpload.single("file")(req, res, (error: unknown) => {
    if (error) {
      next(error);
      return;
    }

  const kind = req.body.kind ?? req.query.kind;
  if (kind !== "video" && kind !== "poster") {
    res.status(400).json({ error: "kind must be either video or poster" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "A media file is required" });
    return;
  }

  const media = mediaResponse(req, req.file, kind);
  void saveMediaMetadata(media.id, {
    ...media,
    sourceUrl: media.url,
    storage: "local-disk",
  })
    .then((firebaseMetadataSaved) => {
      res.status(201).json({ ...media, firebaseMetadataSaved });
    })
    .catch((error: unknown) => {
      req.log.error({ err: error, mediaId: media.id }, "Firebase media metadata write failed");
      res.status(502).json({
        error: "Media was saved locally, but Firebase metadata could not be updated.",
        media,
      });
    });
  });
});

router.post("/media/import", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { sourceUrl, kind, originalName } = req.body ?? {};
  if ((kind !== "video" && kind !== "poster") || typeof sourceUrl !== "string") {
    res.status(400).json({ error: "sourceUrl and kind (video or poster) are required" });
    return;
  }

  try {
    const media = await importRemoteMedia(req, sourceUrl, kind, originalName);
    const firebaseMetadataSaved = await saveMediaMetadata(media.id, {
      ...media,
      sourceUrl: media.url,
      storage: "local-disk",
      importedFrom: sourceUrl,
    });
    res.status(201).json({ ...media, firebaseMetadataSaved });
  } catch (error: unknown) {
    req.log.error({ err: error, sourceUrl, kind }, "Remote media import failed");
    res.status(400).json({ error: error instanceof Error ? error.message : "Remote media import failed" });
  }
});

router.get("/uploads/:kind/:filename", streamMedia);
router.head("/uploads/:kind/:filename", streamMedia);

// Deliberately manual-only. There is no automatic cleanup path for uploads.
router.delete("/media/:kind/:filename", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const kind = Array.isArray(req.params.kind) ? req.params.kind[0] : req.params.kind;
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const deleted = await deleteMedia(kind, filename);

  if (!deleted) {
    res.status(404).json({ error: "Media not found" });
    return;
  }

  const mediaId = filename.replace(/\.[^.]+$/, "");
  try {
    await deleteMediaMetadata(mediaId);
  } catch (error: unknown) {
    req.log.error({ err: error, mediaId }, "Firebase media metadata delete failed");
  }

  res.status(204).end();
});

export default router;