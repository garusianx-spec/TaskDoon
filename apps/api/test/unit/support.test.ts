import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  AgentReplyDto,
  CreateTicketDto,
  SupportReplyDto,
  SupportUploadDto,
  UpdateTicketDto,
} from '../../src/modules/support/support.dto.js';
import { replyStatus, transitionAllowed } from '../../src/modules/support/support.policy.js';

describe('support state transitions', () => {
  it.each(['OPEN', 'IN_PROGRESS', 'ANSWERED', 'RESOLVED'] as const)('agent public replies answer %s', (s) =>
    expect(replyStatus(s, true, false)).toBe('ANSWERED'),
  );
  it('reopens a resolved user conversation for investigation', () =>
    expect(replyStatus('RESOLVED', false, false)).toBe('IN_PROGRESS'));
  it('leaves new user followups open', () => expect(replyStatus('OPEN', false, false)).toBe('OPEN'));
  it('forbids public replies to closed tickets', () => {
    expect(replyStatus('CLOSED', false, false)).toBeNull();
    expect(replyStatus('CLOSED', true, false)).toBeNull();
  });
  it('allows agent-only notes without affecting the public status', () => {
    expect(replyStatus('CLOSED', true, true)).toBe('CLOSED');
    expect(replyStatus('ANSWERED', false, true)).toBeNull();
  });
  it('requires deliberate reopening before answering closed tickets', () => {
    expect(transitionAllowed('CLOSED', 'ANSWERED')).toBe(false);
    expect(transitionAllowed('CLOSED', 'OPEN')).toBe(true);
  });
});
const check = (dto: object) => validate(dto, { whitelist: true, forbidNonWhitelisted: true });
describe('support boundary validation', () => {
  it('normalizes whitespace without accepting an empty description', async () => {
    const good = plainToInstance(CreateTicketDto, {
      workspaceId: randomUUID(),
      commandId: randomUUID(),
      subject: '  عنوان معتبر  ',
      body: ' شرح ',
      department: 'GENERAL',
      priority: 'LOW',
    });
    expect(await check(good)).toHaveLength(0);
    expect(good.subject).toBe('عنوان معتبر');
    expect(
      await check(plainToInstance(SupportReplyDto, { commandId: randomUUID(), body: '   ' })),
    ).not.toHaveLength(0);
  });
  it('rejects private notes or sender impersonation on the public endpoint', async () => {
    for (const extra of [
      { isInternal: true },
      { senderId: randomUUID() },
      { senderType: 'AGENT' },
      { attachments: [{ url: 'https://example.org/file' }] },
    ])
      expect(
        await check(plainToInstance(SupportReplyDto, { commandId: randomUUID(), body: 'message', ...extra })),
      ).not.toHaveLength(0);
  });
  it('validates internal notes strictly instead of coercing false-like strings', async () => {
    expect(
      await check(
        plainToInstance(AgentReplyDto, { commandId: randomUUID(), body: 'note', isInternal: 'false' }),
      ),
    ).not.toHaveLength(0);
  });
  it('rejects duplicate and excessive file references', async () => {
    const id = randomUUID();
    for (const attachmentIds of [[id, id], Array.from({ length: 6 }, () => randomUUID())])
      expect(
        await check(
          plainToInstance(SupportReplyDto, { commandId: randomUUID(), body: 'files', attachmentIds }),
        ),
      ).not.toHaveLength(0);
  });
  it('requires bounded safe uploads and a version for metadata updates', async () => {
    expect(
      await check(
        plainToInstance(SupportUploadDto, {
          commandId: randomUUID(),
          fileName: 'x.exe',
          size: 10,
          contentType: 'application/octet-stream',
        }),
      ),
    ).not.toHaveLength(0);
    expect(await check(plainToInstance(UpdateTicketDto, { status: 'CLOSED' }))).not.toHaveLength(0);
    expect(
      await check(plainToInstance(UpdateTicketDto, { expectedVersion: 1, assignedAdminId: null })),
    ).toHaveLength(0);
  });
});
