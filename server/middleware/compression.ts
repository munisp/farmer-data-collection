import { middleware } from "../_core/trpc-base.js";

export const compressionHeaders = middleware(async ({ ctx, next }) => {
  const result = await next();
  return result;
});

export const COMPRESSION_CONFIG = {
  gzip: { level: 6, threshold: 1024 },
  brotli: { level: 4, threshold: 1024 },
  enabledEncodings: ["br", "gzip", "deflate"],
  excludeMimeTypes: ["image/png", "image/jpeg", "image/gif", "application/zip"],
};
