#!/usr/bin/env node
/**
 * Fetches the Cognito User Pool's JWKS (JSON Web Key Set) and writes it to
 * `backend/src/lib/jwks.json`.
 *
 * Why we do this: our Lambdas run in a VPC with no internet egress (only
 * the Secrets Manager VPC endpoint). That means `aws-jwt-verify` can't
 * fetch JWKS at runtime — its public-internet HTTPS call would timeout.
 *
 * Instead, we fetch the JWKS once at build/deploy time (this script), bake
 * the keys into the Lambda artifact via esbuild's JSON loader, and prime
 * the verifier's in-memory cache at module load.
 *
 * Re-run this script if Cognito rotates the keys (rare — typically yearly,
 * and you'll know because tokens start failing verification). Pool ID and
 * region default to our prod pool but can be overridden via env vars.
 *
 *   node scripts/fetch-jwks.mjs
 *   COGNITO_USER_POOL_ID=us-east-1_xxxxx node scripts/fetch-jwks.mjs
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(HERE, "../src/lib/jwks.json");

const userPoolId = process.env.COGNITO_USER_POOL_ID ?? "us-east-1_aIqAshPg1";
const region = userPoolId.split("_")[0];
const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;

console.log(`Fetching JWKS from ${url}`);

const res = await fetch(url);
if (!res.ok) {
  console.error(`JWKS fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const jwks = await res.json();

if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
  console.error("JWKS response missing or empty 'keys' array:", jwks);
  process.exit(1);
}

await writeFile(OUT_FILE, JSON.stringify(jwks, null, 2) + "\n", "utf8");
console.log(`Wrote ${jwks.keys.length} key(s) to ${OUT_FILE}`);
