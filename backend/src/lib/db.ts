/**
 * MySQL client for Lambda.
 *
 * Pattern: one mysql2 connection per warm container, lazily created, with
 * a `ping` health check before each handoff so we transparently recover
 * from idle-timeout disconnects.
 *
 * Credentials come from Secrets Manager (see `secrets.ts`). The DB host is
 * passed in as an env var so we can point at different instances per stage
 * without rotating the secret.
 */

import mysql, { type Connection } from "mysql2/promise";
import { getSecretJSON } from "./secrets.js";

type DbSecret = {
  username: string;
  password: string;
  // Secrets Manager's "RDS secret type" populates more fields (engine, host,
  // port, dbname) but we only require username + password here so a hand-
  // rolled "Other type of secret" JSON works too.
  host?: string;
  port?: number;
  dbname?: string;
};

let conn: Connection | null = null;

async function open(): Promise<Connection> {
  const secretId = process.env.DB_SECRET_ID;
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME ?? "caresync";
  if (!secretId) throw new Error("DB_SECRET_ID env var not set");
  if (!host) throw new Error("DB_HOST env var not set");

  const cred = await getSecretJSON<DbSecret>(secretId);

  return mysql.createConnection({
    host,
    port: Number(process.env.DB_PORT ?? cred.port ?? 3306),
    user: cred.username,
    password: cred.password,
    database,
    // Aggressive timeouts so a wedged DB doesn't park the Lambda for its
    // entire 10-second budget; bail fast and let the caller surface 5xx.
    connectTimeout: 5_000,
    // Lambdas only run one query at a time per container, so a pool is
    // overkill — a single connection is simpler.
  });
}

/** Returns a healthy MySQL connection. Reuses the cached connection across
 * warm invocations; transparently re-opens if the cached one has died. */
export async function getDb(): Promise<Connection> {
  if (conn) {
    try {
      await conn.ping();
      return conn;
    } catch {
      // Stale connection — drop it and reopen.
      try {
        await conn.end();
      } catch {
        // ignore — already broken
      }
      conn = null;
    }
  }
  conn = await open();
  return conn;
}

/** Test seam — production code never calls this. */
export async function _closeDb(): Promise<void> {
  if (conn) await conn.end();
  conn = null;
}
