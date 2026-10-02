import { type SQL, sql } from 'drizzle-orm';
import type { PlanLimits } from '@taskin/contracts';
import { plans, workspaces } from './schema/all.js';

/**
 * A workspace's limits: its plan's, with a platform admin's overrides applied (phase 3,
 * `workspaces.limit_overrides`, a partial `PlanLimits`). `jsonb ||` keeps the plan's value for
 * every key that is not overridden, and an override of `null` stands (unlimited, where the plan
 * allows that). Without overrides this is exactly the plan's limits.
 *
 * For query-builder statements that join `workspaces` and `plans` under their own names.
 */
export const EFFECTIVE_LIMITS: SQL = sql`(${plans.limits} || coalesce(${workspaces.limitOverrides}, '{}'::jsonb))`;

/** The same for raw SQL, with `workspaces` and `plans` under the aliases given. */
export function effectiveLimits(workspaceAlias: string, planAlias: string): SQL {
  return sql.raw(`(${planAlias}.limits || coalesce(${workspaceAlias}.limit_overrides, '{}'::jsonb))`);
}

/** The same merge in memory, for a plan already loaded. */
export function mergeLimits(plan: PlanLimits, overrides: Partial<PlanLimits> | null | undefined): PlanLimits {
  return overrides ? { ...plan, ...overrides } : plan;
}
