import { TRPCError } from '@trpc/server';
import { checkPermission, setOwner, createRelationship } from './permify';
import { logger } from './logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MiddlewareOpts = {
  ctx: { userId?: string | number; [key: string]: any };
  input?: unknown;
  next: (opts: { ctx: Record<string, unknown> }) => any;
};

/**
 * Permify authorization middleware for tRPC procedures
 * 
 * Usage:
 * const protectedProcedure = publicProcedure.use(permifyMiddleware);
 * 
 * const myProcedure = protectedProcedure
 *   .use(requirePermission('farmer', 'view', (input) => input.farmerId))
 *   .query(async ({ input }) => { ... });
 */

/**
 * Create middleware that checks permission before procedure execution
 */
export function requirePermission(
  resource: string,
  action: string,
  getResourceId: (input: unknown) => string | number
) {
  return async (opts: MiddlewareOpts) => {
    const { ctx, input, next } = opts;

    // Check if user is authenticated
    if (!ctx.userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // Get resource ID from input
    const resourceId = getResourceId(input);
    
    // Check permission
    const hasPermission = await checkPermission(
      ctx.userId,
      resource,
      resourceId,
      action
    );

    if (!hasPermission) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You don't have permission to ${action} this ${resource}`,
      });
    }

    // Permission granted, continue to next middleware or procedure
    return next({ ctx });
  };
}

/**
 * Middleware that automatically sets owner relationship on resource creation
 * Use this after a create mutation to establish ownership
 */
export function setOwnershipOnCreate(
  resource: string,
  getResourceId: (result: unknown) => string | number
) {
  return async (opts: MiddlewareOpts) => {
    const { ctx, next } = opts;

    // Execute the procedure first
    const result = await next({ ctx });

    // Set ownership relationship
    if (ctx.userId && result) {
      try {
        const resourceId = getResourceId(result);
        await setOwner(resource, resourceId, ctx.userId);
        logger.info(`[Permify] Set owner: user:${ctx.userId} owns ${resource}:${resourceId}`);
      } catch (error) {
        logger.error('[Permify] Failed to set ownership:', error);
        // Don't fail the request if permission setup fails
      }
    }

    return result;
  };
}

/**
 * Check if user is admin (has admin role)
 */
export async function isAdmin(userId: string | number): Promise<boolean> {
  try {
    const hasAdminPermission = await checkPermission(
      userId,
      'system',
      'admin',
      'admin_access'
    );
    return hasAdminPermission;
  } catch (error) {
    logger.error('[Permify] Admin check failed:', error);
    return false;
  }
}

/**
 * Require admin role middleware
 */
export function requireAdmin() {
  return async (opts: MiddlewareOpts) => {
    const { ctx, next } = opts;

    if (!ctx.userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const adminStatus = await isAdmin(ctx.userId);
    
    if (!adminStatus) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });
    }

    return next({ ctx });
  };
}

/**
 * Check multiple permissions (OR logic - user needs at least one)
 */
export function requireAnyPermission(
  permissions: Array<{
    resource: string;
    action: string;
    getResourceId: (input: unknown) => string | number;
  }>
) {
  return async (opts: MiddlewareOpts) => {
    const { ctx, input, next } = opts;

    if (!ctx.userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // Check each permission
    const checks = await Promise.all(
      permissions.map(async (perm) => {
        const resourceId = perm.getResourceId(input);
        return checkPermission(ctx.userId!, perm.resource, resourceId, perm.action);
      })
    );

    // User needs at least one permission
    const hasAnyPermission = checks.some((result) => result === true);

    if (!hasAnyPermission) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    }

    return next({ ctx });
  };
}

/**
 * Check multiple permissions (AND logic - user needs all)
 */
export function requireAllPermissions(
  permissions: Array<{
    resource: string;
    action: string;
    getResourceId: (input: unknown) => string | number;
  }>
) {
  return async (opts: MiddlewareOpts) => {
    const { ctx, input, next } = opts;

    if (!ctx.userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // Check each permission
    const checks = await Promise.all(
      permissions.map(async (perm) => {
        const resourceId = perm.getResourceId(input);
        return checkPermission(ctx.userId!, perm.resource, resourceId, perm.action);
      })
    );

    // User needs all permissions
    const hasAllPermissions = checks.every((result) => result === true);

    if (!hasAllPermissions) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    }

    return next({ ctx });
  };
}

/**
 * Helper: Create organization/tenant relationship
 */
export async function addUserToOrganization(
  userId: string | number,
  organizationId: string | number,
  role: 'owner' | 'admin' | 'member' = 'member'
): Promise<void> {
  await createRelationship(
    'organization',
    organizationId,
    role,
    'user',
    userId
  );
}

/**
 * Helper: Grant admin role to user
 */
export async function grantAdminRole(userId: string | number): Promise<void> {
  await createRelationship(
    'system',
    'admin',
    'admin',
    'user',
    userId
  );
}

/**
 * Helper: Create parent-child resource relationship
 * Example: farm belongs to farmer
 */
export async function createParentRelationship(
  childResource: string,
  childId: string | number,
  parentResource: string,
  parentId: string | number
): Promise<void> {
  await createRelationship(
    childResource,
    childId,
    'parent',
    parentResource,
    parentId
  );
}
