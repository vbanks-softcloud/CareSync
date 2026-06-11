/**
 * Wrapper for protected HTTP handlers.
 *
 * Every authenticated endpoint runs the same prologue:
 *   1. Verify the Cognito JWT from the Authorization header
 *   2. Resolve `cognito_sub` to a row in our `users` table
 *   3. Run the actual handler
 *   4. Map errors to JSON responses
 *
 * This wrapper lets the handler functions stay focused on the business
 * logic — they receive a `UserContext` along with the request event.
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { verifyJwt, AuthError } from "./auth.js";
import { getUserContext, type UserContext } from "./user.js";
import { unauthorized, internalError, badRequest, ClientError } from "./http.js";

// Re-export so handlers can import ClientError from one place alongside
// withAuth, even though it lives in http.ts to avoid a circular dep.
export { ClientError } from "./http.js";

export type AuthedHandler = (
  event: APIGatewayProxyEventV2,
  user: UserContext,
) => Promise<APIGatewayProxyResultV2>;

export function withAuth(fn: AuthedHandler) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    let user: UserContext;
    try {
      const authed = await verifyJwt(event);
      user = await getUserContext(authed);
    } catch (err) {
      if (err instanceof AuthError) {
        return unauthorized(err.message);
      }
      return internalError(err);
    }

    try {
      return await fn(event, user);
    } catch (err) {
      // ClientError is thrown by handlers (or by parseJsonBody) to signal a
      // 400. Anything else is an unexpected server error.
      if (err instanceof ClientError) {
        return badRequest(err.message);
      }
      return internalError(err);
    }
  };
}
