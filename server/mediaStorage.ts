import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getCloudMetadataAccessToken } from './firestoreSync.ts';

export type MediaTier = 'free' | 'premium';
export type MediaKind = 'audio' | 'video' | 'image';
export type MediaFolder = 'audio' | 'video' | 'artwork';

export interface AllowedMediaSpec {
  ext: string;
  mime: string;
  kind: MediaKind;
  folder: MediaFolder;
  maxBytes: number;
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_MEDIA_BYTES = 150 * 1024 * 1024; // 150 MB

export const ALLOWED_MEDIA_SPECS: Record<string, AllowedMediaSpec> = {
  mp3: { ext: 'mp3', mime: 'audio/mpeg', kind: 'audio', folder: 'audio', maxBytes: MAX_MEDIA_BYTES },
  wav: { ext: 'wav', mime: 'audio/wav', kind: 'audio', folder: 'audio', maxBytes: MAX_MEDIA_BYTES },
  ogg: { ext: 'ogg', mime: 'audio/ogg', kind: 'audio', folder: 'audio', maxBytes: MAX_MEDIA_BYTES },
  m4a: { ext: 'm4a', mime: 'audio/mp4', kind: 'audio', folder: 'audio', maxBytes: MAX_MEDIA_BYTES },
  webm: { ext: 'webm', mime: 'video/webm', kind: 'video', folder: 'video', maxBytes: MAX_MEDIA_BYTES },
  mp4: { ext: 'mp4', mime: 'video/mp4', kind: 'video', folder: 'video', maxBytes: MAX_MEDIA_BYTES },
  mov: { ext: 'mov', mime: 'video/quicktime', kind: 'video', folder: 'video', maxBytes: MAX_MEDIA_BYTES },
  mkv: { ext: 'mkv', mime: 'video/x-matroska', kind: 'video', folder: 'video', maxBytes: MAX_MEDIA_BYTES },
  jpg: { ext: 'jpg', mime: 'image/jpeg', kind: 'image', folder: 'artwork', maxBytes: MAX_IMAGE_BYTES },
  jpeg: { ext: 'jpg', mime: 'image/jpeg', kind: 'image', folder: 'artwork', maxBytes: MAX_IMAGE_BYTES },
  png: { ext: 'png', mime: 'image/png', kind: 'image', folder: 'artwork', maxBytes: MAX_IMAGE_BYTES },
  webp: { ext: 'webp', mime: 'image/webp', kind: 'image', folder: 'artwork', maxBytes: MAX_IMAGE_BYTES },
};

export const SAFE_UPLOAD_FILENAME_REGEX =
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,160}\.(mp3|wav|ogg|m4a|webm|mp4|mov|mkv|jpg|jpeg|png|webp)$/i;

export interface MediaManifestEntry {
  fileName: string;
  accessTier: MediaTier;
  folder: MediaFolder;
  mediaType: MediaKind;
  mimeType: string;
  sizeBytes: number;
  uploadedByUid: string;
  gcsObjectPath?: string;
  createdAt: string;
}

export function resolveSafeUploadPath(uploadsDir: string, rawFileName: string): {
  fileName: string;
  targetPath: string;
} | null {
  if (!rawFileName || typeof rawFileName !== 'string') return null;
  if (
    rawFileName.includes('/') ||
    rawFileName.includes('\\') ||
    rawFileName.includes('..') ||
    rawFileName.includes('\0')
  ) {
    return null;
  }
  const trimmed = rawFileName.trim();
  if (!SAFE_UPLOAD_FILENAME_REGEX.test(trimmed)) return null;

  const canonicalRoot = path.resolve(uploadsDir);
  const resolved = path.resolve(canonicalRoot, trimmed);
  if (!resolved.startsWith(canonicalRoot + path.sep)) return null;

  return { fileName: trimmed, targetPath: resolved };
}

export function resolveExtensionSpec(
  fileName?: string,
  declaredMime?: string,
  declaredMediaType?: string,
): { spec: AllowedMediaSpec; resolvedExt: string } | null {
  const mimeLower = (declaredMime || '').trim().toLowerCase().split(';')[0].trim();

  if (mimeLower) {
    if (
      mimeLower.includes('svg') ||
      mimeLower.includes('html') ||
      mimeLower.includes('javascript') ||
      mimeLower.includes('php') ||
      mimeLower.includes('executable')
    ) {
      return null;
    }
  }

  let ext = '';
  if (fileName && typeof fileName === 'string') {
    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(fileName.trim());
    if (extMatch) {
      ext = extMatch[1].toLowerCase();
    }
  }

  if (!ext && mimeLower) {
    if (mimeLower === 'audio/mpeg' || mimeLower === 'audio/mp3') ext = 'mp3';
    else if (mimeLower === 'audio/wav' || mimeLower === 'audio/x-wav') ext = 'wav';
    else if (mimeLower === 'audio/ogg') ext = 'ogg';
    else if (mimeLower === 'audio/mp4' || mimeLower === 'audio/x-m4a') ext = 'm4a';
    else if (mimeLower === 'audio/webm') ext = 'webm';
    else if (mimeLower === 'video/webm') ext = 'webm';
    else if (mimeLower === 'video/mp4') ext = 'mp4';
    else if (mimeLower === 'video/quicktime') ext = 'mov';
    else if (mimeLower === 'video/x-matroska') ext = 'mkv';
    else if (mimeLower === 'image/png') ext = 'png';
    else if (mimeLower === 'image/webp') ext = 'webp';
    else if (mimeLower === 'image/jpeg' || mimeLower === 'image/jpg') ext = 'jpg';
  }

  const baseSpec = ALLOWED_MEDIA_SPECS[ext];
  if (!baseSpec) return null;

  // Handle webm container used for audio voice recordings vs video uploads
  if (ext === 'webm' && (declaredMediaType === 'audio' || mimeLower === 'audio/webm')) {
    return {
      spec: {
        ext: 'webm',
        mime: 'audio/webm',
        kind: 'audio',
        folder: 'audio',
        maxBytes: MAX_MEDIA_BYTES,
      },
      resolvedExt: 'webm',
    };
  }

  if (declaredMediaType === 'image' && baseSpec.kind !== 'image') return null;
  if (declaredMediaType === 'audio' && baseSpec.kind !== 'audio') return null;
  if (declaredMediaType === 'video' && baseSpec.kind !== 'video') return null;

  return { spec: baseSpec, resolvedExt: baseSpec.ext };
}

export function verifyMediaMagicBytes(headBytes: Buffer, ext: string): boolean {
  if (!headBytes || headBytes.length < 4) return false;

  // Reject HTML / XML / SVG / Script / Executable masquerading as media
  const headText = headBytes.subarray(0, Math.min(256, headBytes.length)).toString('utf8').trimStart().toLowerCase();
  if (
    headText.startsWith('<!doctype') ||
    headText.startsWith('<html') ||
    headText.startsWith('<svg') ||
    headText.startsWith('<script') ||
    headText.startsWith('<?xml') ||
    headText.startsWith('<?php') ||
    headText.startsWith('#!/')
  ) {
    return false;
  }
  if (
    (headBytes[0] === 0x7f && headBytes[1] === 0x45 && headBytes[2] === 0x4c && headBytes[3] === 0x46) || // ELF
    (headBytes[0] === 0x4d && headBytes[1] === 0x5a) // PE/MZ
  ) {
    return false;
  }

  switch (ext.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return headBytes[0] === 0xff && headBytes[1] === 0xd8 && headBytes[2] === 0xff;
    case 'png':
      return (
        headBytes.length >= 8 &&
        headBytes[0] === 0x89 &&
        headBytes[1] === 0x50 &&
        headBytes[2] === 0x4e &&
        headBytes[3] === 0x47 &&
        headBytes[4] === 0x0d &&
        headBytes[5] === 0x0a &&
        headBytes[6] === 0x1a &&
        headBytes[7] === 0x0a
      );
    case 'webp':
      return (
        headBytes.length >= 12 &&
        headBytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        headBytes.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'wav':
      return (
        headBytes.length >= 12 &&
        headBytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        headBytes.subarray(8, 12).toString('ascii') === 'WAVE'
      );
    case 'ogg':
      return headBytes.subarray(0, 4).toString('ascii') === 'OggS';
    case 'mp3':
      return (
        headBytes.subarray(0, 3).toString('ascii') === 'ID3' ||
        (headBytes[0] === 0xff && (headBytes[1] & 0xe0) === 0xe0)
      );
    case 'mp4':
    case 'm4a':
    case 'mov': {
      if (headBytes.length < 8) return false;
      const boxType = headBytes.subarray(4, 8).toString('ascii');
      if (ext === 'mov') {
        return ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(boxType);
      }
      return boxType === 'ftyp';
    }
    case 'webm':
    case 'mkv':
      return (
        headBytes[0] === 0x1a &&
        headBytes[1] === 0x45 &&
        headBytes[2] === 0xdf &&
        headBytes[3] === 0xa3
      );
    default:
      return false;
  }
}

export function createUniqueUploadFilename(
  originalName: string | undefined,
  ext: string,
  accessTier: MediaTier,
): string {
  const baseRaw = originalName
    ? path.basename(originalName, path.extname(originalName))
    : 'media';
  const cleanBase = baseRaw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+/, '').slice(0, 50) || 'media';
  const prefix = accessTier === 'premium' ? 'prem_' : '';
  const suffix = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  return `${prefix}${cleanBase}_${suffix}.${ext.toLowerCase()}`;
}

export function stripMediaTokenQuery(rawUrl?: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/api/uploads/') || trimmed.startsWith('/api/audio/')) {
    return trimmed.split('?')[0];
  }
  return trimmed;
}

export function extractUploadedFilenameFromUrl(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const cleanPath = rawUrl.trim().split('?')[0];
  if (!cleanPath.startsWith('/api/uploads/')) return null;
  const candidate = cleanPath.slice('/api/uploads/'.length);
  return SAFE_UPLOAD_FILENAME_REGEX.test(candidate) ? candidate : null;
}

export function resolveOrCreateSigningSecret(dataDir: string): string {
  const envSecret = (process.env.MEDIA_SIGNING_SECRET || process.env.SESSION_SECRET || '').trim();
  if (envSecret.length >= 16) return envSecret;

  const keyFile = path.join(dataDir, '.media-signing-key');
  try {
    if (fs.existsSync(keyFile)) {
      const existing = fs.readFileSync(keyFile, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyFile, generated, { mode: 0o600, flag: 'wx' });
    return generated;
  } catch {
    if (fs.existsSync(keyFile)) {
      return fs.readFileSync(keyFile, 'utf8').trim();
    }
    return crypto.randomBytes(32).toString('hex');
  }
}

export interface SignedMediaTokenPayload {
  fn?: string; // fileName for /api/uploads/:fileName
  sid?: string; // storyId
  eid?: string; // episodeId
  uid: string;
  exp: number;
}

export function createSignedMediaToken(
  secret: string,
  payload: Omit<SignedMediaTokenPayload, 'exp'>,
  ttlSeconds = 7200,
): string {
  const fullPayload: SignedMediaTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedMediaToken(
  secret: string,
  token: string,
): SignedMediaTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedMediaTokenPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function verifyGatewayPaymentSignature(params: {
  orderId: string;
  gatewayOrderId?: string;
  gatewayPaymentId: string;
  signature: string;
  secret: string;
}): boolean {
  const { orderId, gatewayOrderId, gatewayPaymentId, signature, secret } = params;
  if (!gatewayPaymentId || !signature || !secret) return false;

  const candidates = [
    gatewayOrderId ? `${gatewayOrderId}|${gatewayPaymentId}` : '',
    `${orderId}|${gatewayPaymentId}`,
  ].filter(Boolean);

  for (const data of candidates) {
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
    const a = Buffer.from(signature.trim().toLowerCase(), 'utf8');
    const b = Buffer.from(expected.toLowerCase(), 'utf8');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

export function verifyWebhookHmacSignature(
  rawBody: Buffer | string,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
  const b = Buffer.from(expected.toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getStorageBucketFromConfig(): string {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { storageBucket?: string };
      return (cfg.storageBucket || '').trim();
    }
  } catch {
    // Ignore read error
  }
  return (process.env.FIREBASE_STORAGE_BUCKET || '').trim();
}

export async function mirrorUploadToGcsIfAvailable(params: {
  filePath: string;
  fileName: string;
  accessTier: MediaTier;
  folder: MediaFolder;
  mimeType: string;
}): Promise<string | undefined> {
  const bucket = getStorageBucketFromConfig();
  if (!bucket) return undefined;
  const token = await getCloudMetadataAccessToken();
  if (!token) return undefined;

  const objectName = `stories/${params.accessTier}/${params.folder}/${params.fileName}`;
  try {
    const data = fs.readFileSync(params.filePath);
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(
      bucket,
    )}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': params.mimeType,
      },
      body: data,
    });
    if (res.ok) {
      return objectName;
    }
  } catch {
    // Non-fatal; local storage remains active
  }
  return undefined;
}

export async function fetchFromGcsFallback(
  objectName: string,
  rangeHeader?: string,
): Promise<{
  status: number;
  contentType: string;
  contentLength?: string;
  contentRange?: string;
  body: Buffer;
} | null> {
  const bucket = getStorageBucketFromConfig();
  if (!bucket || !objectName) return null;
  const token = await getCloudMetadataAccessToken();
  if (!token) return null;

  try {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
      bucket,
    )}/o/${encodeURIComponent(objectName)}?alt=media`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (rangeHeader) {
      headers.Range = rangeHeader;
    }
    const res = await fetch(url, { headers });
    if (!res.ok && res.status !== 206) return null;
    const arrayBuf = await res.arrayBuffer();
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || 'application/octet-stream',
      contentLength: res.headers.get('content-length') || undefined,
      contentRange: res.headers.get('content-range') || undefined,
      body: Buffer.from(arrayBuf),
    };
  } catch {
    return null;
  }
}
