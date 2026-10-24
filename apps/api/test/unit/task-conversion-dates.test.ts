import { describe, expect, it } from 'vitest';
import { ConvertMessageDto } from '../../src/modules/chat/chat.dto.js';
import { ConvertNoteDto } from '../../src/modules/content/content.dto.js';
import { createValidationPipe } from '../../src/platform/http/validation.js';

const projectId = '01900000-0000-7000-8000-000000000021';

describe('task conversion date boundary', () => {
  for (const metatype of [ConvertMessageDto, ConvertNoteDto]) {
    it(`${metatype.name} accepts and normalizes a selected start date through strict request validation`, async () => {
      const converted = await createValidationPipe().transform({ projectId, ...(metatype === ConvertMessageDto ? { title: 'Follow up' } : {}), startDate: '۲۰۲۴-۰۲-۲۸', dueDate: '2024-02-29' }, { type: 'body', metatype });
      expect(converted).toMatchObject({ projectId, startDate: '2024-02-28', dueDate: '2024-02-29' });
    });

    it(`${metatype.name} rejects nonexistent calendar dates`, async () => {
      await expect(createValidationPipe().transform({ projectId, ...(metatype === ConvertMessageDto ? { title: 'Follow up' } : {}), startDate: '2024-02-30' }, { type: 'body', metatype })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fieldErrors: expect.arrayContaining([expect.objectContaining({ field: 'startDate' })]) });
    });
  }
});
