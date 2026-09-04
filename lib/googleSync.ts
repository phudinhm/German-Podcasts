"use client";

import { loadLibrary, mergeLibraries, saveLibrary, type Library } from "./library";

/**
 * Syncing the library through the listener's own Google Drive.
 *
 * There is no database behind this app and adding one to remember which
 * podcasts somebody likes would be the wrong trade: an account to run,
 * personal data to hold, and a bill that grows with users. Drive's
 * appDataFolder is a hidden per-user folder that only this app can see, so the
 * library lives in the listener's own storage. We never see it, there is
 * nothing to breach, and deleting the app takes the data with it.
 *
 * It needs one public client id and nothing secret, because the browser uses
 * the implicit token flow. Without that id configured the app is unchanged and
 * simply local.
 */

const FILE_NAME = "hoerbar-library.json";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GIS_SRC = "https://accounts.google.com/gsi/client";

export function googleClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return id && id.trim() ? id.trim() : null;
}

export function isSyncConfigured(): boolean {
  return googleClientId() !== null;
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in could not be loaded."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

const TOKEN_KEY = "hoerbar.google.token.v1";

interface StoredToken {
  token: string;
  /** Epoch millis. Google's implicit tokens last an hour. */
  expiresAt: number;
}

function readToken(): string | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredToken;
    return stored.expiresAt > Date.now() + 60_000 ? stored.token : null;
  } catch {
    return null;
  }
}

function storeToken(token: string): void {
  try {
    window.localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ token, expiresAt: Date.now() + 55 * 60_000 } satisfies StoredToken),
    );
  } catch {
    // Without storage the token lasts this page load, which still works.
  }
}

export function signedIn(): boolean {
  if (typeof window === "undefined") return false;
  return readToken() !== null;
}

/**
 * Asks for an access token, showing Google's own consent screen the first time.
 *
 * `prompt: ""` lets an already-consented listener through without a dialogue,
 * which is what makes reopening the app feel like staying signed in.
 */
export async function signIn(interactive = true): Promise<string | null> {
  const clientId = googleClientId();
  if (!clientId) return null;

  const existing = readToken();
  if (existing) return existing;

  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) return null;

  return new Promise<string | null>((resolve) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) {
          resolve(null);
          return;
        }
        storeToken(response.access_token);
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

export function signOut(): void {
  const token = readToken();
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing more to clear.
  }
  if (token) window.google?.accounts?.oauth2?.revoke(token);
}

async function findFileId(token: string): Promise<string | null> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&q=${encodeURIComponent(
      `name='${FILE_NAME}'`,
    )}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`Drive replied ${response.status}.`);
  const data = (await response.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

async function readRemote(token: string, fileId: string): Promise<Library | null> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  try {
    return (await response.json()) as Library;
  } catch {
    return null;
  }
}

async function writeRemote(token: string, fileId: string | null, library: Library): Promise<void> {
  const metadata = fileId
    ? { name: FILE_NAME }
    : { name: FILE_NAME, parents: ["appDataFolder"] };

  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  body.append("file", new Blob([JSON.stringify(library)], { type: "application/json" }));

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const response = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!response.ok) throw new Error(`Drive refused the upload (${response.status}).`);
}

/**
 * One round of sync: merge what is here with what is there, keep the result in
 * both places.
 *
 * Merging rather than choosing a winner, because there is no server to say
 * which device is right and losing a saved show to a stale copy is the failure
 * people notice.
 */
export async function syncNow(): Promise<Library> {
  const token = await signIn(false);
  if (!token) throw new Error("Not signed in to Google.");

  const local = loadLibrary();
  const fileId = await findFileId(token);
  const remote = fileId ? await readRemote(token, fileId) : null;

  const merged = remote
    ? mergeLibraries(local, { shows: remote.shows ?? [], recents: remote.recents ?? [], updatedAt: remote.updatedAt ?? "" })
    : local;
  merged.updatedAt = new Date().toISOString();

  saveLibrary(merged);
  await writeRemote(token, fileId, merged);
  return merged;
}
