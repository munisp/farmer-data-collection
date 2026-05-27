import { z } from 'zod';
import { publicProcedure, router } from './_core/trpc-base.js';
import {
  checkPermission,
  createRelationship,
  deleteRelationship,
  lookupResources,
  lookupSubjects,
  setOwner,
  shareResource,
  unshareResource,
} from './permify';
import { TRPCError } from '@trpc/server';

export const permifyRouter = router({
  // Check if user has permission
  checkPermission: publicProcedure
    .input(z.object({
      userId: z.number(),
      resource: z.string(),
      resourceId: z.union([z.string(), z.number()]),
      action: z.string(),
    }))
    .query(async ({ input }: { input: { userId: number; resource: string; resourceId: string | number; action: string } }) => {
      const hasPermission = await checkPermission(
        input.userId,
        input.resource,
        input.resourceId,
        input.action
      );
      
      return { hasPermission };
    }),

  // Create relationship
  createRelationship: publicProcedure
    .input(z.object({
      resource: z.string(),
      resourceId: z.union([z.string(), z.number()]),
      relation: z.string(),
      subjectType: z.string(),
      subjectId: z.union([z.string(), z.number()]),
    }))
    .mutation(async ({ input }: { input: { resource: string; resourceId: string | number; relation: string; subjectType: string; subjectId: string | number } }) => {
      try {
        await createRelationship(
          input.resource,
          input.resourceId,
          input.relation,
          input.subjectType,
          input.subjectId
        );
        
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create relationship',
        });
      }
    }),

  // Delete relationship
  deleteRelationship: publicProcedure
    .input(z.object({
      resource: z.string(),
      resourceId: z.union([z.string(), z.number()]),
      relation: z.string(),
      subjectType: z.string(),
      subjectId: z.union([z.string(), z.number()]),
    }))
    .mutation(async ({ input }: { input: { resource: string; resourceId: string | number; relation: string; subjectType: string; subjectId: string | number } }) => {
      try {
        await deleteRelationship(
          input.resource,
          input.resourceId,
          input.relation,
          input.subjectType,
          input.subjectId
        );
        
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete relationship',
        });
      }
    }),

  // Lookup resources user has access to
  lookupResources: publicProcedure
    .input(z.object({
      userId: z.number(),
      resource: z.string(),
      action: z.string(),
    }))
    .query(async ({ input }: { input: { userId: number; resource: string; action: string } }) => {
      const resourceIds = await lookupResources(
        input.userId,
        input.resource,
        input.action
      );
      
      return { resourceIds };
    }),

  // Lookup subjects that have access to resource
  lookupSubjects: publicProcedure
    .input(z.object({
      resource: z.string(),
      resourceId: z.union([z.string(), z.number()]),
      action: z.string(),
    }))
    .query(async ({ input }: { input: { resource: string; resourceId: string | number; action: string } }) => {
      const subjectIds = await lookupSubjects(
        input.resource,
        input.resourceId,
        input.action
      );
      
      return { subjectIds };
    }),

  // Set owner (helper)
  setOwner: publicProcedure
    .input(z.object({
      resource: z.string(),
      resourceId: z.union([z.string(), z.number()]),
      userId: z.number(),
    }))
    .mutation(async ({ input }: { input: { resource: string; resourceId: string | number; userId: number } }) => {
      try {
        await setOwner(input.resource, input.resourceId, input.userId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to set owner',
        });
      }
    }),

  // Share resource (helper)
  shareResource: publicProcedure
    .input(z.object({
      resource: z.string(),
      resourceId: z.union([z.string(), z.number()]),
      userId: z.number(),
    }))
    .mutation(async ({ input }: { input: { resource: string; resourceId: string | number; userId: number } }) => {
      try {
        await shareResource(input.resource, input.resourceId, input.userId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to share resource',
        });
      }
    }),

  // Unshare resource (helper)
  unshareResource: publicProcedure
    .input(z.object({
      resource: z.string(),
      resourceId: z.union([z.string(), z.number()]),
      userId: z.number(),
    }))
    .mutation(async ({ input }: { input: { resource: string; resourceId: string | number; userId: number } }) => {
      try {
        await unshareResource(input.resource, input.resourceId, input.userId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to unshare resource',
        });
      }
    }),

  // Get all permissions for a resource
  getResourcePermissions: publicProcedure
    .input(z.object({
      resource: z.string(),
      resourceId: z.union([z.string(), z.number()]),
    }))
    .query(async ({ input }: { input: { resource: string; resourceId: string | number } }) => {
      const actions = ['view', 'edit', 'delete', 'share'];
      
      const permissions = await Promise.all(
        actions.map(async (action) => {
          const subjects = await lookupSubjects(
            input.resource,
            input.resourceId,
            action
          );
          return { action, subjects };
        })
      );
      
      return { permissions };
    }),

  // Get user's permissions across all resources
  getUserPermissions: publicProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .query(async ({ input }: { input: { userId: number } }) => {
      const resources = [
        'farmer',
        'farm',
        'crop',
        'livestock',
        'harvest',
        'expense',
        'report',
      ];
      
      const permissions = await Promise.all(
        resources.map(async (resource) => {
          const viewable = await lookupResources(input.userId, resource, 'view');
          const editable = await lookupResources(input.userId, resource, 'edit');
          const deletable = await lookupResources(input.userId, resource, 'delete');
          
          return {
            resource,
            viewable,
            editable,
            deletable,
          };
        })
      );
      
      return { permissions };
    }),
});
