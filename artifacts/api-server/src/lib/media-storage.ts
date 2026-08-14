import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import multer from "multer";

export const mediaRoot = path.resolve(process.env.MEDIA_ROOT ?? path.join(process.cwd(), "public/uploads"));
const legacyMediaRoot = path.resolve(process.cwd(), "artifacts/api-server/public/uploads");
const videoRoot = path.join(mediaRoot, "videos");
const posterRoot = path.join(mediaRoot, "posters");

fs.mkdirSync(videoRoot, { recursive: true });
fs.mkdirSync(posterRoot, { recursive: true });

const videoExtensions = new Set([".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm", ".m4v", ".ts"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function getKind(value: unknown): "video" | "poster" | null {
  return value === "video" || value === "poster" ? value : null;
}

function requestKind(req: Request): "video" | "poster" | null {
  return getKind(req.query.kind) ?? getKind(req.body?.kind);
}

function extensionFor(file: Express.Multer.File): string {
  return path.extname(file.originalname).toLowerCase();
}

function destinationFor(kind: "video" | "poster"): string {
  return kind === "video" ? videoRoot : posterRoot;
}

export const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, callback) => {
      const kind = requestKind(req);
      if (!kind) {
        callback(new Error("kind must be either video or poster"), "");
        return;
      }
      callback(null, destinationFor(kind));
    },
    filename: (_req, file, callback) => {
      const ext = extensionFor(file);
      callback(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: 20 * 1024 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    const kind = requestKind(req);
    const ext = extensionFor(file);
    const accepted =
      kind === "video"
        ? videoExtensions.has(ext)
        : kind === "poster"
          ? imageExtensions.has(ext)
          : false;

    if (!accepted) {
      callback(new Error(`Unsupported ${kind ?? "media"} file type`));
      return;
    }
    callback(null, true);
  },
});

function publicUrl(req: Request, kind: "video" | "poster", filename: string): string {
  const forwardedProto = req.get("x-forwarded-proto") ?? req.protocol;
  const forwardedHost = req.get("x-forwarded-host") ?? req.get("host");
  if (!forwardedHost) {
    throw new Error("Unable to determine the public media host");
  }
  // The API artifact is mounted at /api by the workspace proxy. Keeping the
  // prefix in the returned URL makes it work from both the admin preview and
  // the published domain.
  return `${forwardedProto}://${forwardedHost}/api/uploads/${kind}s/${encodeURIComponent(filename)}`;
}

export function mediaResponse(req: Request, file: Express.Multer.File, kind: "video" | "poster") {
  return mediaRecord(req, kind, {
    filename: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  });
}

function mediaRecord(
  req: Request,
  kind: "video" | "poster",
  file: { filename: string; originalName: string; mimeType: string; size: number },
) {
  return {
    id: path.parse(file.filename).name,
    kind,
    filename: file.filename,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    url: publicUrl(req, kind, file.filename),
    relativePath: `/api/uploads/${kind}s/${file.filename}`,
  };
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.split(";")[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-matroska": ".mkv",
  };
  return extensions[normalized] ?? "";
}

export async function importRemoteMedia(
  req: Request,
  sourceUrl: string,
  kind: "video" | "poster",
  originalName?: string,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error("sourceUrl must be a valid URL");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTP(S) media sources are supported");
  }

  const response = await fetch(parsedUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Remote media source returned HTTP ${response.status}`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const extension = path.extname(parsedUrl.pathname).toLowerCase() || extensionForMimeType(mimeType);
  const acceptedExtensions = kind === "video" ? videoExtensions : imageExtensions;
  if (!acceptedExtensions.has(extension)) {
    throw new Error(`Remote source is not a supported ${kind} file`);
  }
  if (
    kind === "video" &&
    mimeType &&
    !mimeType.startsWith("video/") &&
    mimeType !== "application/octet-stream" &&
    extension !== ".mkv"
  ) {
    throw new Error("Remote source content type is not a video");
  }
  if (kind === "poster" && mimeType && !mimeType.startsWith("image/") && mimeType !== "application/octet-stream") {
    throw new Error("Remote source content type is not an image");
  }

  const filename = `${randomUUID()}${extension}`;
  const destination = path.join(destinationFor(kind), filename);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 20 * 1024 * 1024 * 1024) {
    throw new Error("Remote media exceeds the 20 GB upload limit");
  }

  await pipeline(Readable.fromWeb(response.body as any), fs.createWriteStream(destination));
  const stat = await fs.promises.stat(destination);
  return mediaRecord(req, kind, {
    filename,
    originalName: originalName || path.basename(parsedUrl.pathname) || filename,
    mimeType: mimeType || contentTypeFor(filename),
    size: stat.size,
  });
}

function safeMediaPath(kind: string, filename: string): string | null {
  if (kind !== "videos" && kind !== "posters") return null;
  const roots = kind === "videos"
    ? [videoRoot, path.join(legacyMediaRoot, "videos")]
    : [posterRoot, path.join(legacyMediaRoot, "posters")];

  for (const root of [...new Set(roots)]) {
    const resolved = path.resolve(root, filename);
    if (resolved.startsWith(`${root}${path.sep}`) && fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return null;
}

export async function deleteMedia(kind: string, filename: string): Promise<boolean> {
  const filePath = safeMediaPath(kind, filename);
  if (!filePath || !fs.existsSync(filePath)) return false;
  await fs.promises.unlink(filePath);
  return true;
}

function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function streamMedia(req: Request, res: Response): Promise<void> {
  const kind = Array.isArray(req.params.kind) ? req.params.kind[0] : req.params.kind;
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filePath = safeMediaPath(kind, filename);

  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "Media not found" });
    return;
  }

  const stat = await fs.promises.stat(filePath);
  const size = stat.size;
  const range = req.headers.range;
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
    "Content-Type": contentTypeFor(filename),
  };

  if (!range) {
    res.writeHead(200, { ...headers, "Content-Length": size });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    await pipeline(fs.createReadStream(filePath), res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.status(416).set("Content-Range", `bytes */${size}`).end();
    return;
  }

  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  const requestedStart = hasStart ? Number(match[1]) : 0;
  const requestedEnd = hasEnd ? Number(match[2]) : size - 1;
  const start = hasStart ? requestedStart : Math.max(size - requestedEnd, 0);
  const end = hasStart ? Math.min(requestedEnd, size - 1) : size - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) {
    res.status(416).set("Content-Range", `bytes */${size}`).end();
    return;
  }

  const chunkSize = end - start + 1;
  res.writeHead(206, {
    ...headers,
    "Content-Length": chunkSize,
    "Content-Range": `bytes ${start}-${end}/${size}`,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  await pipeline(fs.createReadStream(filePath, { start, end }), res);
}