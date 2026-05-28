/**
 * tRPC Initialization
 * 
 * Separated from trpc-base to avoid circular dependencies.
 * Cache middleware files import `middleware` from here instead of trpc-base.
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { KeycloakUser } from "../keycloak.js";
import type { User } from "../../drizzle/schema.js";

export type Context = {
  token: string | null;
  keycloakUser: KeycloakUser | null;
  user?: User;
};

export type AuthenticatedContext = Context & {
  user: User;
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const middleware = t.middleware;
export const baseProcedure = t.procedure;
