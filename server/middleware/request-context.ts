import { randomUUID } from "crypto";
import { middleware } from "../_core/trpc-init.js";
import { logger } from "../logger.js";

export interface RequestContext {
  requestId: string;
  startTime: number;
  userAgent: string;
  clientIp: string;
  locale: string;
}

export const requestContextMiddleware = middleware(async ({ ctx, next }) => {
  const headers = (ctx as any).req?.headers || {};
  const requestId = (headers["x-request-id"] as string) || randomUUID();
  const startTime = Date.now();
  const userAgent = (headers["user-agent"] as string) || "unknown";
  const clientIp = (headers["x-forwarded-for"] as string) || (headers["x-real-ip"] as string) || "unknown";
  const locale = (headers["accept-language"] as string)?.split(",")[0] || "en";

  const requestContext: RequestContext = { requestId, startTime, userAgent, clientIp, locale };

  const result = await next({ ctx: { ...ctx, requestContext } });

  const duration = Date.now() - startTime;
  if (duration > 1000) {
    logger.warn("[Performance] Slow request", { requestId, duration, path: (ctx as any).path });
  }

  return result;
});

export function getRequestId(ctx: any): string {
  return ctx?.requestContext?.requestId || "unknown";
}
