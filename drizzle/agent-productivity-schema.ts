/**
 * Agent Productivity Schema
 * Task management, route planning, and visit tracking for field agents
 */

import { pgTable, serial, varchar, text, integer, decimal, boolean, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

// Task status enum
export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
  'overdue',
]);

// Task priority enum
export const taskPriorityEnum = pgEnum('task_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);

// Task type enum
export const taskTypeEnum = pgEnum('task_type', [
  'farmer_registration',
  'farm_visit',
  'loan_assessment',
  'loan_disbursement',
  'repayment_collection',
  'harvest_verification',
  'quality_inspection',
  'training_delivery',
  'cooperative_meeting',
  'follow_up',
  'complaint_resolution',
  'kyc_verification',
  'other',
]);

// Visit outcome enum
export const visitOutcomeEnum = pgEnum('visit_outcome', [
  'successful',
  'farmer_absent',
  'rescheduled',
  'partial',
  'unsuccessful',
  'cancelled',
]);

// Agent tasks table
export const agentTasks = pgTable('agent_tasks', {
  id: serial('id').primaryKey(),
  
  // Task identification
  taskCode: varchar('task_code', { length: 50 }).unique(),
  
  // Assignment
  agentId: integer('agent_id').references(() => users.id).notNull(),
  assignedBy: integer('assigned_by').references(() => users.id),
  
  // Task details
  taskType: taskTypeEnum('task_type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  
  // Priority and status
  priority: taskPriorityEnum('priority').notNull().default('normal'),
  status: taskStatusEnum('status').notNull().default('pending'),
  
  // Target
  targetFarmerId: integer('target_farmer_id').references(() => users.id),
  targetFarmId: integer('target_farm_id'),
  targetCooperativeId: integer('target_cooperative_id'),
  
  // Location
  locationName: varchar('location_name', { length: 255 }),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  
  // Scheduling
  scheduledDate: timestamp('scheduled_date'),
  scheduledTime: varchar('scheduled_time', { length: 10 }),
  dueDate: timestamp('due_date'),
  estimatedDuration: integer('estimated_duration'), // In minutes
  
  // Completion
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  actualDuration: integer('actual_duration'), // In minutes
  
  // Outcome
  outcome: visitOutcomeEnum('outcome'),
  outcomeNotes: text('outcome_notes'),
  
  // Related entities
  relatedLoanId: integer('related_loan_id'),
  relatedOrderId: integer('related_order_id'),
  
  // Offline support
  isOfflineCreated: boolean('is_offline_created').default(false),
  offlineId: varchar('offline_id', { length: 100 }),
  
  // Metadata
  metadata: jsonb('metadata'),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Agent visits (detailed visit records)
export const agentVisits = pgTable('agent_visits', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => agentTasks.id),
  agentId: integer('agent_id').references(() => users.id).notNull(),
  
  // Visit details
  farmerId: integer('farmer_id').references(() => users.id),
  farmId: integer('farm_id'),
  
  // Location tracking
  checkInLatitude: decimal('check_in_latitude', { precision: 10, scale: 7 }),
  checkInLongitude: decimal('check_in_longitude', { precision: 10, scale: 7 }),
  checkInTime: timestamp('check_in_time'),
  checkOutLatitude: decimal('check_out_latitude', { precision: 10, scale: 7 }),
  checkOutLongitude: decimal('check_out_longitude', { precision: 10, scale: 7 }),
  checkOutTime: timestamp('check_out_time'),
  
  // Distance from target
  distanceFromTarget: decimal('distance_from_target', { precision: 10, scale: 2 }), // In meters
  
  // Outcome
  outcome: visitOutcomeEnum('outcome').notNull(),
  notes: text('notes'),
  
  // Data collected
  dataCollected: jsonb('data_collected'), // Form data collected during visit
  
  // Photos
  photoUrls: text('photo_urls'), // JSON array
  
  // Signatures
  farmerSignature: text('farmer_signature'), // Base64 or URL
  agentSignature: text('agent_signature'),
  
  // Follow-up
  requiresFollowUp: boolean('requires_follow_up').default(false),
  followUpDate: timestamp('follow_up_date'),
  followUpNotes: text('follow_up_notes'),
  
  // Offline support
  isOfflineCreated: boolean('is_offline_created').default(false),
  offlineId: varchar('offline_id', { length: 100 }),
  
  // Audit
  visitDate: timestamp('visit_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Agent routes (daily route planning)
export const agentRoutes = pgTable('agent_routes', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => users.id).notNull(),
  
  // Route details
  routeDate: timestamp('route_date').notNull(),
  routeName: varchar('route_name', { length: 255 }),
  
  // Planned stops (JSON array of task IDs and locations)
  plannedStops: jsonb('planned_stops'),
  
  // Optimization
  totalDistance: decimal('total_distance', { precision: 10, scale: 2 }), // In km
  estimatedDuration: integer('estimated_duration'), // In minutes
  optimizedOrder: text('optimized_order'), // JSON array of stop IDs in optimized order
  
  // Actual execution
  actualStartTime: timestamp('actual_start_time'),
  actualEndTime: timestamp('actual_end_time'),
  actualDistance: decimal('actual_distance', { precision: 10, scale: 2 }),
  
  // Statistics
  stopsCompleted: integer('stops_completed').default(0),
  stopsSkipped: integer('stops_skipped').default(0),
  
  // Status
  status: varchar('status', { length: 50 }).default('planned'), // planned, in_progress, completed, cancelled
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Agent performance metrics
export const agentPerformanceMetrics = pgTable('agent_performance_metrics', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => users.id).notNull(),
  
  // Period
  periodType: varchar('period_type', { length: 20 }).notNull(), // daily, weekly, monthly
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  
  // Task metrics
  tasksAssigned: integer('tasks_assigned').default(0),
  tasksCompleted: integer('tasks_completed').default(0),
  tasksOverdue: integer('tasks_overdue').default(0),
  taskCompletionRate: decimal('task_completion_rate', { precision: 5, scale: 2 }),
  
  // Visit metrics
  visitsPlanned: integer('visits_planned').default(0),
  visitsCompleted: integer('visits_completed').default(0),
  visitSuccessRate: decimal('visit_success_rate', { precision: 5, scale: 2 }),
  
  // Registration metrics
  farmersRegistered: integer('farmers_registered').default(0),
  farmsRegistered: integer('farms_registered').default(0),
  
  // Loan metrics
  loansAssessed: integer('loans_assessed').default(0),
  loansDisbursed: integer('loans_disbursed').default(0),
  disbursementAmount: integer('disbursement_amount').default(0), // In cents
  repaymentsCollected: integer('repayments_collected').default(0), // In cents
  
  // Distance and time
  totalDistanceTraveled: decimal('total_distance_traveled', { precision: 10, scale: 2 }), // In km
  totalTimeInField: integer('total_time_in_field'), // In minutes
  averageVisitDuration: integer('average_visit_duration'), // In minutes
  
  // Quality metrics
  dataQualityScore: decimal('data_quality_score', { precision: 5, scale: 2 }), // 0-100
  customerSatisfactionScore: decimal('customer_satisfaction_score', { precision: 5, scale: 2 }), // 0-100
  
  // Audit
  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Agent territories
export const agentTerritories = pgTable('agent_territories', {
  id: serial('id').primaryKey(),
  agentId: integer('agent_id').references(() => users.id).notNull(),
  
  // Territory details
  territoryName: varchar('territory_name', { length: 255 }).notNull(),
  
  // Geographic bounds
  villages: text('villages'), // JSON array
  districts: text('districts'), // JSON array
  regions: text('regions'), // JSON array
  
  // Polygon bounds (GeoJSON)
  boundaryPolygon: jsonb('boundary_polygon'),
  
  // Statistics
  farmerCount: integer('farmer_count').default(0),
  farmCount: integer('farm_count').default(0),
  cooperativeCount: integer('cooperative_count').default(0),
  
  // Status
  isActive: boolean('is_active').default(true),
  
  // Audit
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const agentTasksRelations = relations(agentTasks, ({ one, many }) => ({
  agent: one(users, {
    fields: [agentTasks.agentId],
    references: [users.id],
  }),
  assignedByUser: one(users, {
    fields: [agentTasks.assignedBy],
    references: [users.id],
  }),
  targetFarmer: one(users, {
    fields: [agentTasks.targetFarmerId],
    references: [users.id],
  }),
  visits: many(agentVisits),
}));

export const agentVisitsRelations = relations(agentVisits, ({ one }) => ({
  task: one(agentTasks, {
    fields: [agentVisits.taskId],
    references: [agentTasks.id],
  }),
  agent: one(users, {
    fields: [agentVisits.agentId],
    references: [users.id],
  }),
  farmer: one(users, {
    fields: [agentVisits.farmerId],
    references: [users.id],
  }),
}));

export const agentRoutesRelations = relations(agentRoutes, ({ one }) => ({
  agent: one(users, {
    fields: [agentRoutes.agentId],
    references: [users.id],
  }),
}));

export const agentPerformanceMetricsRelations = relations(agentPerformanceMetrics, ({ one }) => ({
  agent: one(users, {
    fields: [agentPerformanceMetrics.agentId],
    references: [users.id],
  }),
}));

export const agentTerritoriesRelations = relations(agentTerritories, ({ one }) => ({
  agent: one(users, {
    fields: [agentTerritories.agentId],
    references: [users.id],
  }),
}));

// Type exports
export type AgentTask = typeof agentTasks.$inferSelect;
export type NewAgentTask = typeof agentTasks.$inferInsert;
export type AgentVisit = typeof agentVisits.$inferSelect;
export type NewAgentVisit = typeof agentVisits.$inferInsert;
export type AgentRoute = typeof agentRoutes.$inferSelect;
export type NewAgentRoute = typeof agentRoutes.$inferInsert;
export type AgentPerformanceMetric = typeof agentPerformanceMetrics.$inferSelect;
export type NewAgentPerformanceMetric = typeof agentPerformanceMetrics.$inferInsert;
export type AgentTerritory = typeof agentTerritories.$inferSelect;
export type NewAgentTerritory = typeof agentTerritories.$inferInsert;
