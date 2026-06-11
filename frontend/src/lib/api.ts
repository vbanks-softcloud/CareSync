/**
 * CareSync API client.
 *
 * Thin typed wrapper around `fetch` that:
 *   - Reads the API base URL from `VITE_API_BASE_URL` at build time
 *   - Auto-injects the current Cognito ID token as `Authorization: Bearer`
 *   - Parses JSON responses and turns non-2xx responses into a typed
 *     `ApiError` so callers can handle 401/404/etc. specifically
 *
 * All call sites should use `apiFetch<T>()` rather than touching `fetch`
 * directly so we have one place to add retries, instrumentation, etc.
 *
 * Token handling: we ask Cognito for the ID token on every call. Amplify
 * caches and refreshes tokens transparently, so this is effectively free
 * after the first request. We don't try to read tokens out of localStorage
 * ourselves — Amplify owns that and key names are not part of its public
 * API.
 */

import { getIdToken } from "./cognito";

const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class ApiNotConfigured extends Error {
  constructor() {
    super(
      "API base URL is not configured. Set VITE_API_BASE_URL in .env.local " +
        "(see frontend/.env.example).",
    );
    this.name = "ApiNotConfigured";
  }
}

/** True when the build was given a `VITE_API_BASE_URL`. Useful for code
 * that wants to fall back to a different behaviour (e.g. in unit tests). */
export const isApiConfigured = Boolean(baseUrl);

type FetchOptions = {
  /** HTTP method. Defaults to "GET". */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Body, serialized as JSON. Don't set Content-Type — we set it. */
  body?: unknown;
};

/**
 * Make an authenticated request to the API.
 *
 *   const me = await apiFetch<MeResponse>("/api/me");
 *   const patient = await apiFetch<Patient>("/api/patients", {
 *     method: "POST",
 *     body: { name: "Jane Doe", age: 64 },
 *   });
 *
 * Throws `ApiNotConfigured` if the API URL isn't set. Throws `ApiError`
 * for any non-2xx response, with `error.status` and `error.body` set.
 * Throws plain `Error` for network failures or JSON parse errors.
 */
export async function apiFetch<T = unknown>(path: string, options: FetchOptions = {}): Promise<T> {
  if (!baseUrl) throw new ApiNotConfigured();

  const token = await getIdToken();
  if (!token) {
    // Treat "no Cognito session" as a 401 even though we never hit the
    // network — saves call sites from special-casing this branch.
    throw new ApiError(401, "Not signed in", { error: "Unauthorized" });
  }

  const url = joinUrl(baseUrl, path);
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  // 204 No Content — successful delete, no body to parse.
  if (res.status === 204) {
    return undefined as T;
  }

  // Some clients trip on empty 200 bodies (shouldn't happen here, but be
  // defensive). text() then parse so we can show the raw body on a JSON
  // parse failure.
  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`API returned ${res.status} with non-JSON body: ${text.slice(0, 200)}`);
    }
  }

  if (!res.ok) {
    const message =
      (isObject(body) && typeof body.message === "string" && body.message) ||
      `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

function joinUrl(base: string, path: string): string {
  if (!path.startsWith("/")) path = "/" + path;
  return base.replace(/\/+$/, "") + path;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
