import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import { QueryClient } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../../server/trpc";

export const trpc = createTRPCReact<AppRouter>();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      retryDelay: 1000,
      staleTime: 30_000,
      networkMode: 'offlineFirst',
    },
  },
});

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: typeof window !== 'undefined' && (window.location.hostname.includes('manusvm.computer') || window.location.hostname.includes('manus.computer'))
          ? window.location.protocol + '//' + window.location.hostname.replace(/^3000-/, '3001-') + '/api/trpc'
          : "/api/trpc",
        transformer: superjson,
        headers() {
          // Get JWT token from localStorage
          const token = localStorage.getItem("auth_token");
          return token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {};
        },
      }),
    ],
  });
}
