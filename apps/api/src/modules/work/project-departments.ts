import type { CreateProjectBody } from '@taskin/contracts';
import { ApiError } from '../../platform/http/api-error.js';

/** Normalizes new selections and legacy single-department writes without changing omitted fields. */
export function selectedProjectDepartments(body: Pick<CreateProjectBody, 'departmentId' | 'departmentIds'>): readonly string[] | undefined {
  if (body.departmentIds === undefined) return body.departmentId === undefined ? undefined : body.departmentId === null ? [] : [body.departmentId];
  const ids = [...new Set(body.departmentIds)];
  if (body.departmentId !== undefined && body.departmentId !== (ids[0] ?? null)) {
    throw ApiError.validation([{ field: 'departmentIds', message: 'the first department must match departmentId when both are provided' }]);
  }
  return ids;
}
