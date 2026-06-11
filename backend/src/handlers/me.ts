/**
 * GET /api/me
 *
 * Returns the current authenticated user. This is the simplest possible
 * authenticated endpoint — useful as a smoke test that JWT verification +
 * RDS lookup are wired up correctly. The frontend can also use this on
 * first load to confirm the session is still valid.
 */

import { withAuth } from "../lib/handler.js";
import { ok } from "../lib/http.js";

export const handler = withAuth(async (_event, user) => {
  return ok({
    userId: user.userId,
    sub: user.sub,
    email: user.email,
  });
});
