/**
 * Standardized API Gateway HTTP API v2 response helpers.
 *
 * Every API handler returns these so the response shape (status, headers,
 * body) is consistent across endpoints. The helpers take care of JSON
 * serialization and CORS-friendly headers; CORS itself is handled by
 * API Gateway (configured in serverless.yml), but we still send
 * `content-type: application/json` because API Gateway doesn't infer that.
 */

import type { APIGatewayProxyResultV2 } from "aws-lambda";

/** Throw this from a handler to short-circuit with a 400 response. The
 * `withAuth` wrapper catches these and turns them into badRequest()
 * responses without polluting CloudWatch with stack traces. */
export class ClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function ok<T>(data: T): APIGatewayProxyResultV2 {
  return json(200, data);
}

export function created<T>(data: T): APIGatewayProxyResultV2 {
  return json(201, data);
}

export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204, headers: JSON_HEADERS, body: "" };
}

export function badRequest(message: string, details?: unknown): APIGatewayProxyResultV2 {
  return json(400, { error: "BadRequest", message, details });
}

export function unauthorized(message = "Missing or invalid Authorization header"): APIGatewayProxyResultV2 {
  return json(401, { error: "Unauthorized", message });
}

export function forbidden(message = "Forbidden"): APIGatewayProxyResultV2 {
  return json(403, { error: "Forbidden", message });
}

export function notFound(resource = "Resource"): APIGatewayProxyResultV2 {
  return json(404, { error: "NotFound", message: `${resource} not found` });
}

export function methodNotAllowed(method: string): APIGatewayProxyResultV2 {
  return json(405, { error: "MethodNotAllowed", message: `Method ${method} not allowed for this endpoint` });
}

export function internalError(err: unknown): APIGatewayProxyResultV2 {
  const message = err instanceof Error ? err.message : String(err);
  // Log the full error server-side; the client only sees the message.
  console.error("InternalError:", err);
  return json(500, { error: "InternalError", message });
}

/**
 * Parse a JSON body. Returns the parsed object or throws an error that the
 * caller should turn into a 400. API Gateway v2 always gives us a string
 * body (or undefined); we don't have to worry about base64-encoded bodies
 * because we only accept application/json.
 */
export function parseJsonBody<T>(body: string | undefined | null): T {
  if (!body || body.trim() === "") {
    throw new ClientError("Request body is empty.");
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ClientError("Request body is not valid JSON.");
  }
}
