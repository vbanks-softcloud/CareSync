#!/usr/bin/env node
// Deploy the built SPA in ./dist to S3 and (optionally) invalidate CloudFront.
//
// Required env vars:
//   CARESYNC_FRONTEND_BUCKET   target S3 bucket name (no s3:// prefix)
//
// Optional env vars:
//   CARESYNC_CF_DISTRIBUTION_ID  CloudFront distribution to invalidate after sync
//   AWS_REGION                   passed through to the AWS CLI (defaults to env)
//
// This script shells out to the AWS CLI; configure credentials with `aws configure`
// or `aws sso login` first.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const DIST_DIR = resolve(process.cwd(), "dist");
const BUCKET = process.env.CARESYNC_FRONTEND_BUCKET;
const DIST_ID = process.env.CARESYNC_CF_DISTRIBUTION_ID;
const REGION = process.env.AWS_REGION;

if (!BUCKET) {
  console.error("CARESYNC_FRONTEND_BUCKET is required (e.g. caresync-frontend-prod).");
  process.exit(1);
}

if (!existsSync(DIST_DIR) || !statSync(DIST_DIR).isDirectory()) {
  console.error(`Build output not found at ${DIST_DIR}. Run \`npm run build\` first.`);
  process.exit(1);
}

const regionArgs = REGION ? ["--region", REGION] : [];
const isWindows = process.platform === "win32";

// When spawnSync runs through cmd.exe (shell: true), it concatenates argv
// with spaces and lets cmd parse the result -- which breaks on `;`, `&`, `,`,
// `(`, `)`, etc. inside an arg value (e.g. `text/html; charset=utf-8`).
// We pre-quote any arg containing shell-special characters so cmd treats the
// whole token as one literal.
function quoteForWindowsShell(arg) {
  if (!/[\s;&|<>^(),"'`]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const spawnArgs = isWindows ? args.map(quoteForWindowsShell) : args;
  const res = spawnSync(cmd, spawnArgs, { stdio: "inherit", shell: isWindows });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

// 1. Sync fingerprinted assets with a long cache lifetime.
run("aws", [
  "s3",
  "sync",
  DIST_DIR,
  `s3://${BUCKET}`,
  "--delete",
  "--exclude",
  "index.html",
  "--exclude",
  "*.html",
  "--cache-control",
  "public,max-age=31536000,immutable",
  ...regionArgs,
]);

// 2. Upload HTML separately with no-cache so new releases roll out immediately.
run("aws", [
  "s3",
  "sync",
  DIST_DIR,
  `s3://${BUCKET}`,
  "--exclude",
  "*",
  "--include",
  "*.html",
  "--cache-control",
  "no-cache,no-store,must-revalidate",
  "--content-type",
  "text/html; charset=utf-8",
  ...regionArgs,
]);

// 3. Optionally invalidate CloudFront.
if (DIST_ID) {
  run("aws", [
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    DIST_ID,
    "--paths",
    "/*",
    ...regionArgs,
  ]);
} else {
  console.log("Skipping CloudFront invalidation (CARESYNC_CF_DISTRIBUTION_ID not set).");
}

console.log("Deploy complete.");
