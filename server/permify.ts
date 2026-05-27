import { grpc } from '@permify/permify-node';

const PERMIFY_ENDPOINT = process.env.PERMIFY_ENDPOINT || 'localhost:3476';

console.log('[Permify] Initializing Permify client...');
console.log(`  Endpoint: ${PERMIFY_ENDPOINT}`);

// Create Permify client
export const permify = grpc.newClient({
  endpoint: PERMIFY_ENDPOINT,
  cert: null,
  pk: null,
  certChain: null,
  insecure: true, // Use insecure for local development
});

// Tenant ID (can be organization ID or 'default')
const DEFAULT_TENANT_ID = 'default';

/**
 * Check if user has permission to perform action on resource
 */
export async function checkPermission(
  userId: string | number,
  resource: string,
  resourceId: string | number,
  action: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<boolean> {
  try {
    const response = await permify.permission.check({
      tenantId,
      metadata: {
        schemaVersion: '',
        snapToken: '',
        depth: 20,
      },
      entity: {
        type: resource,
        id: resourceId.toString(),
      },
      permission: action,
      subject: {
        type: 'user',
        id: userId.toString(),
      },
    });

    return response.can === grpc.base.CheckResult.CHECK_RESULT_ALLOWED;
  } catch (error) {
    console.error('[Permify] Permission check failed:', error);
    // Fail closed - deny access on error
    return false;
  }
}

/**
 * Create relationship (e.g., user owns farmer)
 */
export async function createRelationship(
  resource: string,
  resourceId: string | number,
  relation: string,
  subjectType: string,
  subjectId: string | number,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  try {
    await permify.data.write({
      tenantId,
      metadata: {
        schemaVersion: '',
      },
      tuples: [
        {
          entity: {
            type: resource,
            id: resourceId.toString(),
          },
          relation,
          subject: {
            type: subjectType,
            id: subjectId.toString(),
          },
        },
      ],
    });

    console.log(`[Permify] Created relationship: ${subjectType}:${subjectId} ${relation} ${resource}:${resourceId}`);
  } catch (error) {
    console.error('[Permify] Failed to create relationship:', error);
    throw error;
  }
}

/**
 * Delete relationship
 */
export async function deleteRelationship(
  resource: string,
  resourceId: string | number,
  relation: string,
  subjectType: string,
  subjectId: string | number,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  try {
    await permify.data.delete({
      tenantId,
      tupleFilter: {
        entity: {
          type: resource,
          ids: [resourceId.toString()],
        },
        relation,
        subject: {
          type: subjectType,
          ids: [subjectId.toString()],
        },
      },
    });

    console.log(`[Permify] Deleted relationship: ${subjectType}:${subjectId} ${relation} ${resource}:${resourceId}`);
  } catch (error) {
    console.error('[Permify] Failed to delete relationship:', error);
    throw error;
  }
}

/**
 * Get all resources user has permission for
 */
export async function lookupResources(
  userId: string | number,
  resource: string,
  action: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<string[]> {
  try {
    const response = await permify.permission.lookupEntity({
      tenantId,
      metadata: {
        schemaVersion: '',
        snapToken: '',
        depth: 20,
      },
      entityType: resource,
      permission: action,
      subject: {
        type: 'user',
        id: userId.toString(),
      },
    });

    return response.entityIds || [];
  } catch (error) {
    console.error('[Permify] Lookup resources failed:', error);
    return [];
  }
}

/**
 * Get all subjects that have permission on resource
 */
export async function lookupSubjects(
  resource: string,
  resourceId: string | number,
  action: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<string[]> {
  try {
    const response = await permify.permission.lookupSubject({
      tenantId,
      metadata: {
        schemaVersion: '',
        snapToken: '',
        depth: 20,
      },
      entity: {
        type: resource,
        id: resourceId.toString(),
      },
      permission: action,
      subjectReference: {
        type: 'user',
        relation: '',
      },
    });

    return response.subjectIds || [];
  } catch (error) {
    console.error('[Permify] Lookup subjects failed:', error);
    return [];
  }
}

/**
 * Helper: Create owner relationship when resource is created
 */
export async function setOwner(
  resource: string,
  resourceId: string | number,
  userId: string | number,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  await createRelationship(resource, resourceId, 'owner', 'user', userId, tenantId);
}

/**
 * Helper: Share resource with another user (viewer)
 */
export async function shareResource(
  resource: string,
  resourceId: string | number,
  userId: string | number,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  await createRelationship(resource, resourceId, 'viewer', 'user', userId, tenantId);
}

/**
 * Helper: Unshare resource
 */
export async function unshareResource(
  resource: string,
  resourceId: string | number,
  userId: string | number,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<void> {
  await deleteRelationship(resource, resourceId, 'viewer', 'user', userId, tenantId);
}

/**
 * Middleware: Check permission before tRPC procedure execution
 */
export function requirePermission(
  resource: string,
  action: string,
  getResourceId: (input: any) => string | number
) {
  return async (opts: any) => {
    const { ctx, input, next } = opts;

    if (!ctx.userId) {
      throw new Error('Unauthorized: No user ID in context');
    }

    const resourceId = getResourceId(input);
    const hasPermission = await checkPermission(
      ctx.userId,
      resource,
      resourceId,
      action
    );

    if (!hasPermission) {
      throw new Error(`Forbidden: User ${ctx.userId} cannot ${action} ${resource}:${resourceId}`);
    }

    return next();
  };
}

console.log('[Permify] Client initialized');
