/**
 * Resolves a Cognito identity to a row in our `users` table.
 *
 * Every authenticated request goes through this. The `cognitoPostConfirmation`
 * trigger normally creates the `users` row the moment a user finishes signup,
 * but we also auto-create on first API call as a defensive measure: that way
 * existing pool users (e.g. ones who signed up before the trigger was wired,
 * or imported users) don't get permanently locked out of the app.
 *
 * The auto-create uses INSERT IGNORE (relying on the UNIQUE constraint on
 * cognito_sub) so concurrent requests from the same user can't double-insert.
 */

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getDb } from "./db.js";
import type { AuthedUser } from "./auth.js";

export type UserContext = {
  /** Primary key in our `users` table (CHAR(36) UUID). */
  userId: string;
  /** Cognito sub. Same as what's in the JWT. */
  sub: string;
  /** Email from the ID token, if present. */
  email?: string;
};

/**
 * Looks up the `users.id` for an authenticated request. Creates the row if
 * it doesn't exist yet (idempotent — safe to call concurrently for the same
 * sub). Returns the full UserContext for the rest of the handler to use.
 */
export async function getUserContext(authed: AuthedUser): Promise<UserContext> {
  const db = await getDb();

  // Fast path: the row almost always exists because cognitoPostConfirmation
  // creates it at signup time.
  const [rows] = await db.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE cognito_sub = ? LIMIT 1",
    [authed.sub],
  );
  if (rows.length > 0) {
    return { userId: rows[0].id as string, sub: authed.sub, email: authed.email };
  }

  // Slow path: row missing. Insert (idempotent on the UNIQUE constraint),
  // then re-read to get the auto-generated UUID. We do a separate SELECT
  // rather than reading INSERT's lastInsertId because our id is a string
  // UUID, not an AUTO_INCREMENT integer.
  await db.query<ResultSetHeader>(
    "INSERT IGNORE INTO users (cognito_sub) VALUES (?)",
    [authed.sub],
  );

  const [rowsAfter] = await db.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE cognito_sub = ? LIMIT 1",
    [authed.sub],
  );
  if (rowsAfter.length === 0) {
    // Should be unreachable: INSERT IGNORE either inserted or the row
    // already existed (lost race with concurrent insert). Either way the
    // SELECT must find it.
    throw new Error(`Failed to resolve user for sub ${authed.sub}`);
  }

  return { userId: rowsAfter[0].id as string, sub: authed.sub, email: authed.email };
}
