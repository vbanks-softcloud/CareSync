/**
 * Cognito User Pool "Post confirmation" trigger.
 *
 * Cognito calls this Lambda the moment a user finishes signup (i.e. just
 * after they submit the email-verification code). We insert a row into
 * the `users` table keyed by `cognito_sub` so that future patient/note/
 * audit/recording rows have a stable foreign-key target. All identity
 * data (email, name, birthdate, occupation, ...) stays in Cognito —
 * Option A architecture, see database/README.md.
 *
 * Error policy: this trigger MUST NOT throw. If it does, the user's
 * signup still completes (Cognito has already confirmed them by the
 * time the trigger fires) but our application state diverges from
 * Cognito. We log loudly to CloudWatch instead so we can backfill any
 * orphaned users later via a one-off script.
 *
 * Idempotency: `INSERT IGNORE` so re-runs (e.g. Cognito retries the
 * trigger after a transient failure) don't error out.
 */

import { getDb } from "../lib/db.js";

type PostConfirmationEvent = {
  version: string;
  triggerSource: string;
  region: string;
  userPoolId: string;
  userName: string;
  callerContext?: Record<string, unknown>;
  request: {
    userAttributes: Record<string, string>;
  };
  response: Record<string, unknown>;
};

export const handler = async (event: PostConfirmationEvent): Promise<PostConfirmationEvent> => {
  const sub = event?.request?.userAttributes?.sub;
  const email = event?.request?.userAttributes?.email ?? "(unknown)";

  if (!sub) {
    console.error("PostConfirmation: missing sub in event", {
      triggerSource: event?.triggerSource,
      userName: event?.userName,
    });
    return event;
  }

  // Only act on actual signup confirmations. Cognito also fires this
  // trigger for ForgotPassword confirmations etc. — those users already
  // exist in our DB so we'd just hit the duplicate-key path, but
  // gating up front saves a round trip.
  if (event.triggerSource && event.triggerSource !== "PostConfirmation_ConfirmSignUp") {
    return event;
  }

  try {
    const db = await getDb();
    const [result] = await db.query("INSERT IGNORE INTO users (cognito_sub) VALUES (?)", [sub]);
    console.log("PostConfirmation: inserted users row", {
      sub,
      email,
      result,
    });
  } catch (err) {
    // Swallow the error — see the error policy comment at the top.
    console.error("PostConfirmation: failed to insert users row", {
      sub,
      email,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return event;
};
