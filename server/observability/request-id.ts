/**
 * Request ID Propagation Middleware
 * Generates/forwards X-Request-ID headers for distributed tracing correlation.
 */
import type { IncomingMessage, ServerResponse } from "http";

let counter = 0;

export function generateRequestId(): string {
  counter++;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req_${timestamp}_${random}_${counter}`;
}

export function requestIdMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const requestId = (req.headers["x-request-id"] as string) || generateRequestId();
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("X-Correlation-ID", requestId);
  next();
}
