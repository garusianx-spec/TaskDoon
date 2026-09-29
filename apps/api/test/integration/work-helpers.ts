import type { Response } from 'supertest';
import { expect } from 'vitest';
import type { CreateProjectBody, CreateTaskBody, ProjectView, TaskDetail, WorkflowView } from '@taskin/contracts';
import { bearer, idempotencyKey, type Session, type TestApp } from './harness.js';

/** Fails with the response body in the message, which is what you want when a status is off. */
export function expectStatus(response: Response, status: number): void {
  expect(response.status, `${response.status}: ${JSON.stringify(response.body)}`).toBe(status);
}

let keySeq = 0;
/** A unique project key: two upper-case letters and up to four digits. */
export function projectKey(): string {
  keySeq += 1;
  const letters = String.fromCharCode(65 + (keySeq % 26), 65 + (Math.floor(keySeq / 26) % 26));
  return `${letters}${keySeq % 10000}`;
}

export const wsPath = (workspaceId: string) => `/api/v1/workspaces/${workspaceId}`;

export async function createProject(t: TestApp, as: Session, workspaceId: string, body: Partial<CreateProjectBody> = {}): Promise<ProjectView> {
  const response = await t
    .http()
    .post(`${wsPath(workspaceId)}/projects`)
    .set(bearer(as))
    .set('Idempotency-Key', idempotencyKey())
    .send({ key: projectKey(), name: 'پروژه آزمایشی', ...body });
  expectStatus(response, 201);
  return response.body as ProjectView;
}

export async function createTask(t: TestApp, as: Session, workspaceId: string, body: Partial<CreateTaskBody> & { projectId: string }): Promise<TaskDetail> {
  const response = await t
    .http()
    .post(`${wsPath(workspaceId)}/tasks`)
    .set(bearer(as))
    .set('Idempotency-Key', idempotencyKey())
    .send({ title: 'وظیفه آزمایشی', ...body });
  expectStatus(response, 201);
  return response.body as TaskDetail;
}

/** A project's own workflow: every project has one. */
export async function getWorkflow(t: TestApp, as: Session, workspaceId: string, projectId: string): Promise<WorkflowView> {
  const response = await t.http().get(`${wsPath(workspaceId)}/workflow?projectId=${projectId}`).set(bearer(as));
  expectStatus(response, 200);
  return response.body as WorkflowView;
}

/** Adds `user` to a project with `role` (as someone allowed to). */
export async function putProjectMember(t: TestApp, as: Session, workspaceId: string, projectId: string, userId: string, role: 'lead' | 'contributor' | 'viewer'): Promise<void> {
  const response = await t.http().put(`${wsPath(workspaceId)}/projects/${projectId}/members/${userId}`).set(bearer(as)).send({ role });
  expectStatus(response, 200);
}

/** The outbox events of `type` written for `aggregateId`, oldest first. */
export async function outboxEvents(t: TestApp, type: string, aggregateId?: string): Promise<{ payload: Record<string, unknown>; headers: Record<string, string> }[]> {
  const { rows } = await t.admin.query<{ payload: Record<string, unknown>; headers: Record<string, string> }>(
    `select payload, headers from outbox_events where event_type = $1 ${aggregateId ? 'and aggregate_id = $2' : ''} order by id`,
    aggregateId ? [type, aggregateId] : [type],
  );
  return rows;
}

/** Moves a workspace to another plan (plans are reference data; tests switch them directly). */
export async function usePlan(t: TestApp, workspaceId: string, planId: 'free' | 'team' | 'enterprise'): Promise<void> {
  await t.admin.query('update workspaces set plan_id = $2 where id = $1', [workspaceId, planId]);
}
