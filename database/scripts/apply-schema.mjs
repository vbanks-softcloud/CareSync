#!/usr/bin/env node
/**
 * One-off script: applies the SQL file at ../schemas/001_initial_mysql_schema.sql
 * to the RDS instance specified by env vars.
 *
 * Idempotency: the schema file uses `CREATE TABLE` (not `IF NOT EXISTS` on the
 * tables themselves), so re-running this against a populated DB will fail with
 * "table already exists". Pass DROP_FIRST=true to wipe first (DESTRUCTIVE — do
 * this only during development).
 *
 * Usage (PowerShell):
 *   $env:DB_HOST = "caresync-db.cmf2m8o2079n.us-east-1.rds.amazonaws.com"
 *   $env:DB_USER = "admin"
 *   $env:DB_PASSWORD = "<paste-from-1password-not-here>"
 *   npm run apply-schema
 *
 * The script connects without specifying a database name first (since the
 * file's CREATE DATABASE statement creates it), then runs the file end to end.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import mysql from "mysql2/promise";

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = resolve(HERE, "../schemas/001_initial_mysql_schema.sql");

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}`);
  console.error("See the top of this file for the usage example.");
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Critical: multipleStatements lets us run the whole file in one go. We
  // accept the SQL-injection risk here because the source is a trusted file
  // we control, not user input.
  multipleStatements: true,
  // Generous timeout for a freshly-woken RDS instance.
  connectTimeout: 30_000,
});

console.log(`Connected to ${process.env.DB_HOST} as ${process.env.DB_USER}.`);

if (process.env.DROP_FIRST === "true") {
  console.log("DROP_FIRST=true — dropping and recreating database 'caresync'.");
  await conn.query("DROP DATABASE IF EXISTS caresync;");
}

const sql = await readFile(SQL_FILE, "utf8");
console.log(`Applying ${SQL_FILE} (${sql.length} bytes)...`);

try {
  await conn.query(sql);
  console.log("Schema applied successfully.");
} catch (err) {
  console.error("Schema apply failed:", err.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}

if (process.exitCode === 1) process.exit(1);

// Quick sanity check — list the tables we expect to find.
const verifyConn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: "caresync",
});
const [rows] = await verifyConn.query("SHOW TABLES;");
console.log("\nTables in `caresync`:");
for (const row of rows) {
  console.log(`  - ${Object.values(row)[0]}`);
}
await verifyConn.end();

console.log("\nDone. Don't forget to flip RDS back to 'Publicly accessible: No' when you're finished.");
