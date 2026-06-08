/**
 * AWS Cognito wrapper around aws-amplify v6.
 *
 * Two modes:
 *   1. CONFIGURED: env vars VITE_COGNITO_USER_POOL_ID and
 *      VITE_COGNITO_USER_POOL_CLIENT_ID are present. All auth calls hit a real
 *      Cognito User Pool with TOTP MFA.
 *   2. MOCK: env vars missing. `isCognitoConfigured` is false and the rest of
 *      the app falls back to the localStorage mock in `caresync-store.ts`.
 *      Lets local `npm run dev` work without deploying a pool first.
 */

import { Amplify } from "aws-amplify";
import {
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  resendSignUpCode as amplifyResendSignUpCode,
  signIn as amplifySignIn,
  confirmSignIn as amplifyConfirmSignIn,
  signOut as amplifySignOut,
  getCurrentUser as amplifyGetCurrentUser,
  fetchUserAttributes as amplifyFetchUserAttributes,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmResetPassword,
} from "aws-amplify/auth";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID as string | undefined;

export const isCognitoConfigured = Boolean(userPoolId && userPoolClientId);

if (isCognitoConfigured) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: userPoolId!,
        userPoolClientId: userPoolClientId!,
        signUpVerificationMethod: "code",
        loginWith: { email: true },
      },
    },
  });
}

export type AuthUser = { email: string };

export type SignInStep =
  | { kind: "DONE" }
  | { kind: "MFA_TOTP" }
  | { kind: "MFA_SETUP"; secretCode: string; otpAuthUri: string }
  | { kind: "CONFIRM_SIGN_UP" }
  | { kind: "NEW_PASSWORD" };

export class CognitoNotConfigured extends Error {
  constructor() {
    super(
      "Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_USER_POOL_CLIENT_ID.",
    );
  }
}

function requireConfigured() {
  if (!isCognitoConfigured) throw new CognitoNotConfigured();
}

/** Self-signup with email as username. Cognito emails a 6-digit confirmation code. */
export async function signUp(email: string, password: string): Promise<void> {
  requireConfigured();
  await amplifySignUp({
    username: email,
    password,
    options: { userAttributes: { email } },
  });
}

/** Confirm a fresh sign-up using the 6-digit code emailed to the user. */
export async function confirmSignUp(email: string, code: string): Promise<void> {
  requireConfigured();
  await amplifyConfirmSignUp({ username: email, confirmationCode: code });
}

/** Re-send the 6-digit sign-up confirmation code. */
export async function resendSignUpCode(email: string): Promise<void> {
  requireConfigured();
  await amplifyResendSignUpCode({ username: email });
}

/**
 * Step 1 of sign-in. With required TOTP MFA, Cognito always returns either:
 *   - MFA_SETUP    (first login — user must scan a QR code in their authenticator app)
 *   - MFA_TOTP     (subsequent logins — user enters a code from the app)
 * Done is unlikely with mandatory MFA but handled for completeness.
 */
export async function signIn(email: string, password: string): Promise<SignInStep> {
  requireConfigured();
  const res = await amplifySignIn({ username: email, password });
  return mapStep(res.nextStep, email);
}

/** Step 2 of sign-in. Provide either the 6-digit TOTP code or the MFA setup code. */
export async function confirmSignIn(code: string): Promise<SignInStep> {
  requireConfigured();
  const res = await amplifyConfirmSignIn({ challengeResponse: code });
  return mapStep(res.nextStep, undefined);
}

export async function signOut(): Promise<void> {
  requireConfigured();
  await amplifySignOut();
}

/** Step 1 of forgot-password. Cognito emails a 6-digit reset code to the user. */
export async function resetPassword(email: string): Promise<void> {
  requireConfigured();
  await amplifyResetPassword({ username: email });
}

/** Step 2 of forgot-password. Use the emailed code + new password to reset. */
export async function confirmResetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  requireConfigured();
  await amplifyConfirmResetPassword({
    username: email,
    confirmationCode: code,
    newPassword,
  });
}

/** Returns the signed-in user (with email) or null if not signed in. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isCognitoConfigured) return null;
  try {
    await amplifyGetCurrentUser();
    const attrs = await amplifyFetchUserAttributes();
    const email = attrs.email ?? "";
    return email ? { email } : null;
  } catch {
    return null;
  }
}

/* ---------------- internals ---------------- */

type NextStep = Awaited<ReturnType<typeof amplifySignIn>>["nextStep"];

function mapStep(next: NextStep, email: string | undefined): SignInStep {
  switch (next.signInStep) {
    case "DONE":
      return { kind: "DONE" };
    case "CONFIRM_SIGN_IN_WITH_TOTP_CODE":
      return { kind: "MFA_TOTP" };
    case "CONTINUE_SIGN_IN_WITH_TOTP_SETUP": {
      // Amplify gives us a shared secret; we build the otpauth:// URI ourselves
      // so the landing page can render it as a QR code (or show as fallback).
      const secretCode = next.totpSetupDetails.sharedSecret;
      const issuer = "CareSync";
      const account = encodeURIComponent(email ?? "user");
      const otpAuthUri = `otpauth://totp/${issuer}:${account}?secret=${secretCode}&issuer=${issuer}`;
      return { kind: "MFA_SETUP", secretCode, otpAuthUri };
    }
    case "CONFIRM_SIGN_UP":
      return { kind: "CONFIRM_SIGN_UP" };
    case "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED":
      return { kind: "NEW_PASSWORD" };
    default:
      // Any other Cognito step (SMS MFA, custom challenge, etc.) — we don't
      // enable these, so treat as a generic "needs MFA code" challenge.
      return { kind: "MFA_TOTP" };
  }
}
