import { TRPCError } from "@trpc/server";
import { middleware } from "../trpc";

// Centralized Authorization Middleware
// Integrates with Keycloak for authentication and Permify for fine-grained authorization

export type Permission =
  // Farmer permissions
  | "farmer:read"
  | "farmer:write"
  | "farmer:delete"
  | "farmer:verify"
  // Farm permissions
  | "farm:read"
  | "farm:write"
  | "farm:delete"
  // Loan permissions
  | "loan:read"
  | "loan:write"
  | "loan:approve"
  | "loan:disburse"
  | "loan:collect"
  // Marketplace permissions
  | "marketplace:read"
  | "marketplace:sell"
  | "marketplace:buy"
  | "marketplace:moderate"
  // Exchange permissions
  | "exchange:read"
  | "exchange:trade"
  | "exchange:admin"
  // Admin permissions
  | "admin:users"
  | "admin:settings"
  | "admin:audit"
  | "admin:reports"
  // Finance permissions
  | "finance:read"
  | "finance:write"
  | "finance:approve";

export type Role = "farmer" | "trader" | "lender" | "agent" | "moderator" | "admin" | "superadmin";

// Role to permissions mapping
const rolePermissions: Record<Role, Permission[]> = {
  farmer: [
    "farmer:read",
    "farm:read",
    "farm:write",
    "loan:read",
    "marketplace:read",
    "marketplace:sell",
    "marketplace:buy",
    "exchange:read",
    "exchange:trade",
  ],
  trader: [
    "farmer:read",
    "marketplace:read",
    "marketplace:buy",
    "exchange:read",
    "exchange:trade",
  ],
  lender: [
    "farmer:read",
    "loan:read",
    "loan:write",
    "loan:approve",
    "loan:disburse",
    "loan:collect",
    "finance:read",
  ],
  agent: [
    "farmer:read",
    "farmer:write",
    "farm:read",
    "farm:write",
    "loan:read",
  ],
  moderator: [
    "farmer:read",
    "marketplace:read",
    "marketplace:moderate",
    "admin:audit",
  ],
  admin: [
    "farmer:read",
    "farmer:write",
    "farmer:verify",
    "farm:read",
    "farm:write",
    "loan:read",
    "loan:write",
    "loan:approve",
    "marketplace:read",
    "marketplace:moderate",
    "exchange:read",
    "exchange:admin",
    "admin:users",
    "admin:settings",
    "admin:audit",
    "admin:reports",
    "finance:read",
  ],
  superadmin: [
    "farmer:read",
    "farmer:write",
    "farmer:delete",
    "farmer:verify",
    "farm:read",
    "farm:write",
    "farm:delete",
    "loan:read",
    "loan:write",
    "loan:approve",
    "loan:disburse",
    "loan:collect",
    "marketplace:read",
    "marketplace:sell",
    "marketplace:buy",
    "marketplace:moderate",
    "exchange:read",
    "exchange:trade",
    "exchange:admin",
    "admin:users",
    "admin:settings",
    "admin:audit",
    "admin:reports",
    "finance:read",
    "finance:write",
    "finance:approve",
  ],
};

// Check if user has permission
export function hasPermission(userRole: Role, permission: Permission): boolean {
  const permissions = rolePermissions[userRole] || [];
  return permissions.includes(permission);
}

// Check if user has any of the permissions
export function hasAnyPermission(userRole: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(userRole, p));
}

// Check if user has all permissions
export function hasAllPermissions(userRole: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(userRole, p));
}

// Middleware to require specific permission
export const requirePermission = (permission: Permission) =>
  middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const userRole = (ctx.user.role as Role) || "farmer";
    
    if (!hasPermission(userRole, permission)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission denied: ${permission}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        permission,
      },
    });
  });

// Middleware to require any of the permissions
export const requireAnyPermission = (permissions: Permission[]) =>
  middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const userRole = (ctx.user.role as Role) || "farmer";
    
    if (!hasAnyPermission(userRole, permissions)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission denied: requires one of ${permissions.join(", ")}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        permissions,
      },
    });
  });

// Middleware to require all permissions
export const requireAllPermissions = (permissions: Permission[]) =>
  middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const userRole = (ctx.user.role as Role) || "farmer";
    
    if (!hasAllPermissions(userRole, permissions)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission denied: requires all of ${permissions.join(", ")}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        permissions,
      },
    });
  });

// Middleware to require specific role
export const requireRole = (roles: Role | Role[]) =>
  middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const userRole = (ctx.user.role as Role) || "farmer";
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(userRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Role required: ${allowedRoles.join(" or ")}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        role: userRole,
      },
    });
  });

// Middleware to require admin role
export const requireAdmin = requireRole(["admin", "superadmin"]);

// Middleware to require superadmin role
export const requireSuperAdmin = requireRole("superadmin");

// Resource-based authorization
export interface ResourceCheck {
  resourceType: string;
  resourceId: string | number;
  action: "read" | "write" | "delete" | "admin";
}

// Check if user owns or has access to a resource
// Note: This middleware should be used with procedure.input() to get typed input
// The getResource callback receives ctx and can extract resource info from ctx
export const requireResourceAccess = (getResource: (ctx: { user: { id: number; role: string } }) => Promise<ResourceCheck>) =>
  middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const resource = await getResource(ctx as { user: { id: number; role: string } });
    const userRole = (ctx.user.role as Role) || "farmer";

    // Admins can access all resources
    if (userRole === "admin" || userRole === "superadmin") {
      return next({ ctx });
    }

    // Check resource ownership based on type
    const isOwner = await checkResourceOwnership(
      ctx.user.id,
      resource.resourceType,
      resource.resourceId
    );

    if (!isOwner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Access denied to ${resource.resourceType}`,
      });
    }

    return next({
      ctx: {
        ...ctx,
        resource,
      },
    });
  });

// Check resource ownership (simplified - would integrate with Permify in production)
async function checkResourceOwnership(
  userId: number,
  resourceType: string,
  resourceId: string | number
): Promise<boolean> {
  // This would typically query Permify or the database
  // For now, return true to allow access (implement actual checks based on your data model)
  
  // Example checks:
  // - farmer: check if farmer.userId === userId
  // - farm: check if farm.farmerId belongs to user
  // - loan: check if loan.userId === userId
  // - order: check if order.buyerId === userId or order.sellerId === userId
  
  return true; // Placeholder - implement actual ownership checks
}

// Audit logging for authorization decisions
export function logAuthorizationDecision(
  userId: number,
  action: string,
  resource: string,
  allowed: boolean,
  reason?: string
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    resource,
    allowed,
    reason,
  };
  
  // In production, this would write to an audit log table or external service
  console.log("[AUTH]", JSON.stringify(logEntry));
}
