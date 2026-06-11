/**
 * Dev convenience Lambda: print a snapshot of the current DB state so
 * you can verify writes are landing without setting up MySQL Workbench
 * or a bastion EC2.
 *
 *   sls invoke -f inspectDb --stage dev
 *
 * Output: an array of `{ table, rowCount, sample }` objects, where
 * `sample` is the first 10 rows of each table.
 *
 * This is intentionally read-only and listed as a dev-only function —
 * we deliberately don't add an httpApi event so it can't accidentally be
 * exposed publicly. The only way to invoke it is `sls invoke` (or the
 * AWS console "Test" button) with AWS-authenticated credentials.
 */

import { getDb } from "../lib/db.js";

type TableInfo = {
  table: string;
  rowCount: number;
  sample: Array<Record<string, unknown>>;
};

export const handler = async (): Promise<{ database: string; tables: TableInfo[] }> => {
  const db = await getDb();
  // Belt-and-suspenders: caresync should already be the default DB from
  // the connection config, but USE-ing it explicitly avoids surprises if
  // someone repointed DB_NAME without rebuilding.
  await db.query("USE caresync");

  const [tableRows] = await db.query("SHOW TABLES");
  const tableNames = (tableRows as Array<Record<string, string>>).map((r) => Object.values(r)[0]);

  const tables: TableInfo[] = [];
  for (const t of tableNames) {
    const [countRows] = await db.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    const rowCount = (countRows as Array<{ n: number }>)[0].n;
    const [sampleRows] = await db.query(`SELECT * FROM \`${t}\` ORDER BY 1 DESC LIMIT 10`);
    tables.push({
      table: t,
      rowCount,
      sample: sampleRows as Array<Record<string, unknown>>,
    });
  }

  return { database: "caresync", tables };
};
