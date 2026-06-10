/**
 * Tiny wrapper around AWS Secrets Manager with warm-start caching.
 *
 * Lambda containers are reused across invocations, so we cache the resolved
 * secret in module scope. First invocation: ~150ms round-trip to Secrets
 * Manager + decrypt. Subsequent invocations on the same container: ~0ms.
 *
 * The cache is intentionally never invalidated within a single container
 * lifetime — if you rotate the secret, the worst case is one stale-credential
 * failure before the container is recycled, which we accept. For more
 * aggressive freshness you'd add a TTL here, but for hackathon-scale traffic
 * this is fine.
 */

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});
const cache = new Map<string, unknown>();

/** Returns the secret value parsed as JSON. Secrets Manager secrets are
 * stored as JSON-string blobs by convention; we follow that pattern so a
 * single secret can hold username + password + host together. */
export async function getSecretJSON<T>(secretId: string): Promise<T> {
  const hit = cache.get(secretId);
  if (hit) return hit as T;

  const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!res.SecretString) {
    throw new Error(`Secret ${secretId} has no SecretString (binary secrets not supported).`);
  }

  let parsed: T;
  try {
    parsed = JSON.parse(res.SecretString) as T;
  } catch {
    throw new Error(`Secret ${secretId} is not valid JSON.`);
  }

  cache.set(secretId, parsed);
  return parsed;
}

/** Test seam: clears the in-process cache. Production code never calls this. */
export function _clearSecretsCache(): void {
  cache.clear();
}
