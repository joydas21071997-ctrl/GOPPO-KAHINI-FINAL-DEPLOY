import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AdminPermission } from '../src/types/content.ts';

export const EDITOR_ALLOWED_PERMISSIONS: readonly AdminPermission[] = [
  'manage_stories',
  'manage_media',
  'manage_hero',
  'translate_stories',
  'manage_categories',
];

export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  'manage_stories',
  'manage_media',
  'manage_hero',
  'translate_stories',
  'manage_categories',
  'manage_settings',
  'manage_users_orders',
  'manage_editors',
  'export_import_catalog',
];

export interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  signInProvider?: string;
}

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseAppletConfig(): FirebaseAppletConfig {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as FirebaseAppletConfig;
    }
  } catch {
    // Fallback to environment variables
  }
  return {};
}

export function getFirebaseRuntimeConfig(): { projectId: string; databaseId: string } {
  const fileConfig = loadFirebaseAppletConfig();
  return {
    projectId: (process.env.FIREBASE_PROJECT_ID || fileConfig.projectId || '').trim(),
    databaseId: (process.env.FIREBASE_DATABASE_ID || fileConfig.firestoreDatabaseId || '(default)').trim(),
  };
}

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: { keys: Record<string, string>; expiresAt: number } | null = null;

async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && cachedCerts.expiresAt > now) {
    return cachedCerts.keys;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error('Unable to retrieve Firebase public verification certificates.');
  }

  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const keys = (await res.json()) as Record<string, string>;

  cachedCerts = {
    keys,
    expiresAt: now + Math.max(60, maxAgeSeconds) * 1000,
  };
  return keys;
}

function decodeBase64Url(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad === 0 ? normalized : normalized + '='.repeat(4 - pad);
  return Buffer.from(padded, 'base64');
}

export async function verifyFirebaseIdToken(
  idToken: string,
): Promise<VerifiedFirebaseToken | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  const { projectId } = getFirebaseRuntimeConfig();
  if (!projectId) return null;

  try {
    const header = JSON.parse(decodeBase64Url(parts[0]).toString('utf-8')) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf-8')) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      auth_time?: number;
      email?: string;
      email_verified?: boolean;
      name?: string;
      firebase?: { sign_in_provider?: string };
    };

    if (header.alg !== 'RS256' || !header.kid) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
    if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null;
    if (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 300) return null;

    const certs = await fetchGooglePublicCerts();
    const certPem = certs[header.kid];
    if (!certPem) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const signatureValid = verifier.verify(certPem, decodeBase64Url(parts[2]));
    if (!signatureValid) return null;

    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '',
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name.trim() : '',
      signInProvider: payload.firebase?.sign_in_provider,
    };
  } catch {
    return null;
  }
}

function parseCsvEnv(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isEnvProvisionedOwner(verified: VerifiedFirebaseToken): boolean {
  const allowedUids = parseCsvEnv(process.env.OWNER_ADMIN_UIDS);
  if (allowedUids.has(verified.uid)) {
    return true;
  }

  if (!verified.emailVerified || !verified.email) {
    return false;
  }

  const allowedEmails = new Set([
    ...Array.from(parseCsvEnv(process.env.OWNER_ADMIN_EMAILS)).map((e) => e.toLowerCase()),
    ...Array.from(parseCsvEnv(process.env.ADMIN_EMAIL)).map((e) => e.toLowerCase()),
  ]);

  return allowedEmails.has(verified.email.toLowerCase());
}

export async function checkFirestoreRoleDoc(
  idToken: string,
  collectionName: 'admins' | 'editors',
  uid: string,
): Promise<Record<string, unknown> | null> {
  const { projectId, databaseId } = getFirebaseRuntimeConfig();
  if (!projectId || !uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) return null;

  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId,
    )}/databases/${encodeURIComponent(databaseId || '(default)')}/documents/${collectionName}/${encodeURIComponent(uid)}`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { fields?: Record<string, unknown> };
    return data.fields || null;
  } catch {
    return null;
  }
}

export function parseFirestorePermissions(
  fields: Record<string, unknown> | null,
): AdminPermission[] {
  if (!fields) return [];
  const rawPerms = fields.permissions as {
    arrayValue?: { values?: Array<{ stringValue?: string }> };
  };
  const list = rawPerms?.arrayValue?.values || [];
  return sanitizeEditorPermissions(list.map((v) => v.stringValue || ''));
}

export function sanitizeEditorPermissions(input: unknown): AdminPermission[] {
  if (!Array.isArray(input)) return [];
  const allowedSet = new Set<string>(EDITOR_ALLOWED_PERMISSIONS);
  const out = new Set<AdminPermission>();
  for (const item of input) {
    if (typeof item === 'string' && allowedSet.has(item)) {
      out.add(item as AdminPermission);
    }
  }
  return Array.from(out);
}
