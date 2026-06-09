#!/usr/bin/env node
// One-shot configuration for "Option A" static website hosting on S3.
//
// Reads two env vars (or CLI args):
//   CARESYNC_FRONTEND_BUCKET   bucket name (e.g. caresync-frontend-2026)
//   AWS_REGION                 bucket region (e.g. ca-central-1)
//
// What it does:
//   1. Relaxes Block Public Access enough for a public bucket policy.
//   2. Attaches a public-read GetObject policy.
//   3. Enables S3 website hosting with index.html as both index + error
//      document. The error-document trick is what makes client-side routes
//      like /dashboard resolve (the SPA boots, the router takes over).
//   4. Prints the resulting website endpoint URL.
//
// Safe to re-run.

import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BUCKET = process.env.CARESYNC_FRONTEND_BUCKET ?? process.argv[2];
const REGION = process.env.AWS_REGION ?? process.argv[3];

if (!BUCKET || !REGION) {
  console.error(
    "Usage: CARESYNC_FRONTEND_BUCKET=<bucket> AWS_REGION=<region> node configure-s3-website.mjs\n" +
      "   or: node configure-s3-website.mjs <bucket> <region>",
  );
  process.exit(1);
}

function aws(args) {
  console.log(`> aws ${args.join(" ")}`);
  const res = spawnSync("aws", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function awsJSON(args) {
  console.log(`> aws ${args.join(" ")}`);
  const res = spawnSync("aws", args, {
    stdio: ["inherit", "pipe", "inherit"],
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
  return res.stdout;
}

// 1. Public Access Block: keep ACL-based blocks on, but allow bucket policies.
aws([
  "s3api",
  "put-public-access-block",
  "--bucket",
  BUCKET,
  "--region",
  REGION,
  "--public-access-block-configuration",
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false",
]);

// 2. Public-read bucket policy. Write to a temp file and pass via file://
//    to avoid Windows shell mangling the JSON.
const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "PublicReadGetObject",
      Effect: "Allow",
      Principal: "*",
      Action: "s3:GetObject",
      Resource: `arn:aws:s3:::${BUCKET}/*`,
    },
  ],
};
const policyPath = join(tmpdir(), `caresync-bucket-policy-${Date.now()}.json`);
writeFileSync(policyPath, JSON.stringify(policy));
try {
  aws([
    "s3api",
    "put-bucket-policy",
    "--bucket",
    BUCKET,
    "--region",
    REGION,
    "--policy",
    `file://${policyPath.replace(/\\/g, "/")}`,
  ]);
} finally {
  try {
    unlinkSync(policyPath);
  } catch {
    /* ignore */
  }
}

// 3. Enable static website hosting; index.html doubles as the SPA fallback.
aws([
  "s3",
  "website",
  `s3://${BUCKET}/`,
  "--index-document",
  "index.html",
  "--error-document",
  "index.html",
  "--region",
  REGION,
]);

// 4. Print the website endpoint.
// ca-central-1 uses the "dot" form: <bucket>.s3-website.<region>.amazonaws.com
// us-east-1 / older regions use the "dash" form: <bucket>.s3-website-<region>.amazonaws.com
const dotRegions = new Set([
  "ap-east-1",
  "ap-northeast-3",
  "ap-south-1",
  "ca-central-1",
  "cn-north-1",
  "cn-northwest-1",
  "eu-central-1",
  "eu-north-1",
  "eu-west-2",
  "eu-west-3",
  "me-south-1",
  "us-east-2",
]);
const sep = dotRegions.has(REGION) ? "." : "-";
const websiteUrl = `http://${BUCKET}.s3-website${sep}${REGION}.amazonaws.com`;

console.log("\n=================================================");
console.log("S3 static website hosting is configured.");
console.log(`Website URL: ${websiteUrl}`);
console.log("=================================================\n");
console.log("Next:");
console.log("  npm run build:frontend");
console.log(
  `  CARESYNC_FRONTEND_BUCKET=${BUCKET} AWS_REGION=${REGION} npm run deploy --workspace=@caresync/frontend`,
);
