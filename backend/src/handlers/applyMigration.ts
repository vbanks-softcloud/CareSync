/**
 * One-shot Lambda that applies a SQL file from the embedded migration set
 * against the configured RDS instance. Invoke once per migration:
 *
 *   sls invoke -f applyMigration -d '{"file":"001_initial_mysql_schema.sql"}'
 *
 * or from the AWS console: Lambda → caresync-backend-{stage}-applyMigration
 * → Test → JSON body `{"file":"001_initial_mysql_schema.sql"}`.
 *
 * SQL files are bundled into the deployment artifact at build time via the
 * esbuild `.sql` text loader configured in serverless.yml. That keeps the
 * Lambda self-contained (no S3 fetch, no filesystem mount) and means the
 * migration we apply is exactly the one in source control at deploy time.
 */

import { getDb } from "../lib/db.js";

// @ts-expect-error — esbuild text loader bundles the SQL file as a string.
import schema001 from "../../../database/schemas/001_initial_mysql_schema.sql";
// @ts-expect-error — esbuild text loader bundles the SQL file as a string.
import schema002 from "../../../database/schemas/002_add_updated_at_to_care_notes.sql";
// @ts-expect-error — esbuild text loader bundles the SQL file as a string.
import schema003 from "../../../database/schemas/003_add_per_field_edit_timestamps.sql";
// @ts-expect-error — esbuild text loader bundles the SQL file as a string.
import schema004 from "../../../database/schemas/004_add_miscellaneous_notes.sql";
// @ts-expect-error — esbuild text loader bundles the SQL file as a string.
import schema005 from "../../../database/schemas/005_add_birthdate_and_gender_to_patients.sql";

// Add new entries here as you add new migration files. The key is what the
// caller passes in `event.file`; the value is the embedded SQL string.
const MIGRATIONS: Record<string, string> = {
  "001_initial_mysql_schema.sql": schema001 as string,
  "002_add_updated_at_to_care_notes.sql": schema002 as string,
  "003_add_per_field_edit_timestamps.sql": schema003 as string,
  "004_add_miscellaneous_notes.sql": schema004 as string,
  "005_add_birthdate_and_gender_to_patients.sql": schema005 as string,
};

export type ApplyMigrationEvent = {
  file: string;
  /** Destructive — drops the entire `caresync` database first. Use only in
   * dev. Defaults to false. */
  dropFirst?: boolean;
};

export type ApplyMigrationResult =
  | {
      ok: true;
      file: string;
      droppedFirst: boolean;
      tables: string[];
    }
  | {
      ok: false;
      file: string;
      error: string;
    };

export const handler = async (event: ApplyMigrationEvent): Promise<ApplyMigrationResult> => {
  const file = event?.file;
  if (!file) {
    return { ok: false, file: "", error: "Missing required field `file` in event payload." };
  }
  const sql = MIGRATIONS[file];
  if (!sql) {
    return {
      ok: false,
      file,
      error: `Unknown migration '${file}'. Known: ${Object.keys(MIGRATIONS).join(", ")}`,
    };
  }

  const db = await getDb();

  // multipleStatements is OFF on the shared db connection by default. The
  // migration runner is the one place where running a whole file in a single
  // round-trip makes sense, so open a dedicated connection for it.
  // (We can't easily re-open the cached connection with different flags.)
  await db.query("SELECT 1"); // sanity ping before we go destructive

  try {
    if (event.dropFirst) {
      await db.query("DROP DATABASE IF EXISTS caresync");
    }

    // mysql2 only accepts multi-statement strings when the connection was
    // opened with multipleStatements:true. We don't want that flag on the
    // shared app connection (SQL injection footgun), so we split + run.
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      await db.query(stmt);
    }

    // List the tables so the caller can see what landed.
    await db.query("USE caresync");
    const [rows] = await db.query("SHOW TABLES");
    const tables = (rows as Array<Record<string, string>>).map((r) => Object.values(r)[0]);

    return { ok: true, file, droppedFirst: !!event.dropFirst, tables };
  } catch (err) {
    return {
      ok: false,
      file,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Splits a SQL file into individual statements by terminating semicolons.
 * Skips empty/whitespace-only chunks and `-- line comments`.
 *
 * This is intentionally naive — it does NOT handle semicolons inside string
 * literals, `DELIMITER` blocks, or stored procedures. That's fine for our
 * DDL-only schema files; revisit when we add a migration that needs them.
 */
function splitSqlStatements(sql: string): string[] {
  const stripped = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
