import { describe, expect, it } from 'vitest';
import { UpdateMeDto } from '../../src/modules/users/me.controller.js';
import { createValidationPipe } from '../../src/platform/http/validation.js';

describe('display name request validation', () => {
  it('trims the name before validating its length', async () => {
    const body = await createValidationPipe().transform({ fullName: '  نسیم رحیمی  ' }, { type: 'body', metatype: UpdateMeDto });
    expect(body.fullName).toBe('نسیم رحیمی');
  });

  it('rejects blank, nullable, non-string and oversized names', async () => {
    for (const fullName of ['  ', ' ن ', null, 42, 'ن'.repeat(81)]) {
      await expect(createValidationPipe().transform({ fullName }, { type: 'body', metatype: UpdateMeDto })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('preserves partial profile updates that omit the name', async () => {
    const body = await createValidationPipe().transform({ avatarTone: 'teal' }, { type: 'body', metatype: UpdateMeDto });
    expect(body.fullName).toBeUndefined();
  });
});
