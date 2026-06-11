/**
 * Cognito JWT verification.
 *
 * The frontend obtains an ID token from Cognito after signin (via Amplify
 * Auth) and attaches it to every API request as `Authorization: Bearer <jwt>`.
 *
 * We verify the token here using AWS's official `aws-jwt-verify` library.
 * Normally that library lazy-fetches the user pool's JWKS (public keys)
 * from `https://cognito-idp.{region}.amazonaws.com/.../jwks.json` on first
 * call. **That doesn't work for us** — our Lambdas run in a VPC with no
 * internet egress (only the Secrets Manager VPC endpoint), so the JWKS
 * fetch would timeout and every API call would 500.
 *
 * Workaround: we fetch the JWKS at build time (`scripts/fetch-jwks.mjs`),
 * bundle it as `jwks.json`, and prime the verifier's in-memory cache at
 * module load. The library then operates fully offline. Re-run the fetch
 * script if Cognito rotates keys (rare, typically yearly).
 *
 * We use the ID token (not the access token) because the ID token carries
 * the `email` claim, which is convenient for logging. Either would work for
 * identity (both contain `sub`).
 */

import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import jwks from "./jwks.json" with { type: "json" };

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

if (!userPoolId) {
  // Crash on module load rather than at the first request — that way a
  // misconfigured deploy fails fast at cold start.
  throw new Error("COGNITO_USER_POOL_ID env var not set");
}
if (!clientId) {
  throw new Error("COGNITO_CLIENT_ID env var not set");
}

const verifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: "id",
  clientId,
});

// Prime the verifier with the build-time JWKS so it never tries to fetch
// from the public internet (which our VPC blocks). cacheJwks treats this
// as the authoritative key set — subsequent verify() calls hit memory only.
verifier.cacheJwks(jwks);

export type AuthedUser = {
  /** Cognito sub — the immutable UUID for this user. */
  sub: string;
  /** Email claim from the ID token (may be undefined if the user signed up
   * via a federated IdP that didn't return email — not our case today,
   * but treat it defensively). */
  email?: string;
};

/**
 * Extracts and verifies the Bearer token from the request's Authorization
 * header. Throws if the header is missing, malformed, or the token fails
 * verification.
 */
export async function verifyJwt(event: APIGatewayProxyEventV2): Promise<AuthedUser> {
  // API Gateway lowercases all header names in v2. Accept both cases anyway
  // for paranoia / local testing with serverless-offline.
  const authHeader =
    event.headers?.authorization ?? event.headers?.Authorization ?? null;

  if (!authHeader || typeof authHeader !== "string") {
    throw new AuthError("Missing Authorization header");
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AuthError("Authorization header must be 'Bearer <token>'");
  }
  const token = match[1].trim();

  try {
    const payload = await verifier.verify(token);
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch (err) {
    // aws-jwt-verify throws descriptive errors (e.g. "Token expired",
    // "Invalid signature"); surface them to the client so debugging is
    // possible without exposing keys/internals.
    const msg = err instanceof Error ? err.message : "Invalid token";
    throw new AuthError(`Token verification failed: ${msg}`);
  }
}

/** Distinct error class so handlers can catch auth failures specifically
 * and respond 401 (vs. catching everything as a 500). */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
