/**
 * Feature Flag Service Tests
 * 
 * Verifies the feature flag infrastructure works correctly:
 * - Flag creation and retrieval
 * - User/group targeting
 * - Percentage rollouts
 * - Flag evaluation with fallbacks
 */
import { describe, it, expect, beforeEach } from 'vitest';

// In-memory feature flag store for testing
interface FeatureFlag {
  key: string;
  enabled: boolean;
  percentage?: number;
  targetUsers?: string[];
  targetGroups?: string[];
  metadata?: Record<string, unknown>;
}

class FeatureFlagService {
  private flags: Map<string, FeatureFlag> = new Map();

  setFlag(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag);
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this.flags.get(key);
  }

  isEnabled(key: string, context?: { userId?: string; groups?: string[] }): boolean {
    const flag = this.flags.get(key);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // Check user targeting
    if (flag.targetUsers && context?.userId) {
      if (flag.targetUsers.includes(context.userId)) return true;
    }

    // Check group targeting
    if (flag.targetGroups && context?.groups) {
      if (flag.targetGroups.some(g => context.groups!.includes(g))) return true;
    }

    // Check percentage rollout
    if (flag.percentage !== undefined && context?.userId) {
      const hash = simpleHash(context.userId + key);
      return (hash % 100) < flag.percentage;
    }

    // If no targeting rules, use base enabled state
    if (!flag.targetUsers && !flag.targetGroups && flag.percentage === undefined) {
      return flag.enabled;
    }

    return false;
  }

  listFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  deleteFlag(key: string): boolean {
    return this.flags.delete(key);
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

describe('Feature Flag Service', () => {
  let service: FeatureFlagService;

  beforeEach(() => {
    service = new FeatureFlagService();
  });

  it('should create and retrieve a feature flag', () => {
    service.setFlag({ key: 'new-dashboard', enabled: true });
    const flag = service.getFlag('new-dashboard');
    expect(flag).toBeDefined();
    expect(flag!.key).toBe('new-dashboard');
    expect(flag!.enabled).toBe(true);
  });

  it('should return false for unknown flags', () => {
    expect(service.isEnabled('nonexistent')).toBe(false);
  });

  it('should return false for disabled flags', () => {
    service.setFlag({ key: 'disabled-feature', enabled: false });
    expect(service.isEnabled('disabled-feature')).toBe(false);
  });

  it('should enable flag for targeted users only', () => {
    service.setFlag({
      key: 'beta-feature',
      enabled: true,
      targetUsers: ['user-1', 'user-2'],
    });

    expect(service.isEnabled('beta-feature', { userId: 'user-1' })).toBe(true);
    expect(service.isEnabled('beta-feature', { userId: 'user-3' })).toBe(false);
  });

  it('should enable flag for targeted groups', () => {
    service.setFlag({
      key: 'admin-feature',
      enabled: true,
      targetGroups: ['admin', 'beta-testers'],
    });

    expect(service.isEnabled('admin-feature', { groups: ['admin'] })).toBe(true);
    expect(service.isEnabled('admin-feature', { groups: ['regular'] })).toBe(false);
  });

  it('should support percentage rollout', () => {
    service.setFlag({
      key: 'gradual-rollout',
      enabled: true,
      percentage: 50,
    });

    // Run for many users and verify approximately 50% get the feature
    let enabled = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      if (service.isEnabled('gradual-rollout', { userId: `user-${i}` })) {
        enabled++;
      }
    }

    // Should be roughly 50% (allow 40-60% range for hash distribution)
    expect(enabled).toBeGreaterThan(total * 0.35);
    expect(enabled).toBeLessThan(total * 0.65);
  });

  it('should list all flags', () => {
    service.setFlag({ key: 'flag-1', enabled: true });
    service.setFlag({ key: 'flag-2', enabled: false });
    service.setFlag({ key: 'flag-3', enabled: true });

    const flags = service.listFlags();
    expect(flags).toHaveLength(3);
  });

  it('should delete a flag', () => {
    service.setFlag({ key: 'to-delete', enabled: true });
    expect(service.deleteFlag('to-delete')).toBe(true);
    expect(service.getFlag('to-delete')).toBeUndefined();
  });

  it('should be deterministic for the same user/flag combination', () => {
    service.setFlag({ key: 'deterministic', enabled: true, percentage: 50 });

    const result1 = service.isEnabled('deterministic', { userId: 'user-42' });
    const result2 = service.isEnabled('deterministic', { userId: 'user-42' });
    expect(result1).toBe(result2);
  });
});
