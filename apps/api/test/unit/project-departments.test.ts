import { describe, expect, it } from 'vitest';
import { CreateProjectDto, UpdateProjectDto } from '../../src/modules/work/work.dto.js';
import { selectedProjectDepartments } from '../../src/modules/work/project-departments.js';
import { createValidationPipe } from '../../src/platform/http/validation.js';

const engineering = '01900000-0000-7000-8000-000000000021';
const design = '01900000-0000-7000-8000-000000000022';

describe('project department request boundary', () => {
  for (const metatype of [CreateProjectDto, UpdateProjectDto]) {
    const base = () => metatype === CreateProjectDto ? { key: 'PH2', name: 'پروژه مشترک' } : {};

    it(`${metatype.name} accepts multiple and empty department selections`, async () => {
      for (const departmentIds of [[engineering, design], []]) {
        const result = await createValidationPipe().transform({ ...base(), departmentIds }, { type: 'body', metatype });
        expect(result.departmentIds).toEqual(departmentIds);
      }
    });

    it(`${metatype.name} rejects malformed, nullable and oversized selections`, async () => {
      for (const departmentIds of [[engineering, 'other-workspace'], engineering, null, Array.from({ length: 21 }, () => design)]) {
        await expect(createValidationPipe().transform({ ...base(), departmentIds }, { type: 'body', metatype })).rejects.toMatchObject({
          code: 'VALIDATION_FAILED',
          fieldErrors: expect.arrayContaining([expect.objectContaining({ field: 'departmentIds' })]),
        });
      }
    });
  }
});

describe('project department selection compatibility', () => {
  it('preserves omitted fields and normalizes legacy assignment and clearing', () => {
    expect(selectedProjectDepartments({})).toBeUndefined();
    expect(selectedProjectDepartments({ departmentId: engineering })).toEqual([engineering]);
    expect(selectedProjectDepartments({ departmentId: null })).toEqual([]);
  });

  it('deduplicates selections while retaining their primary choice', () => {
    expect(selectedProjectDepartments({ departmentIds: [design, engineering, design] })).toEqual([design, engineering]);
    expect(selectedProjectDepartments({ departmentId: design, departmentIds: [design, engineering] })).toEqual([design, engineering]);
    expect(selectedProjectDepartments({ departmentId: null, departmentIds: [] })).toEqual([]);
  });

  it('refuses contradictory legacy and multi-select values', () => {
    for (const body of [
      { departmentId: engineering, departmentIds: [design, engineering] },
      { departmentId: null, departmentIds: [design] },
      { departmentId: engineering, departmentIds: [] },
    ]) expect(() => selectedProjectDepartments(body)).toThrow('Some fields are not valid.');
  });
});
