import { afterEach, describe, expect, it, vi } from 'vitest';
import { redactQueueFailure, withHealthTimeout } from '../../src/modules/platform-admin/platform-health.service.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('redactQueueFailure: safe, bounded operational summaries', () => {
  it('masks phone numbers and codes in Latin, Persian and Arabic digits', () => {
    const safe = redactQueueFailure('Sending failed for +989121234567; OTP ۴۵۶۷۸۹ and code ١٢٣٤٥٦');
    expect(safe).toContain('Sending failed');
    expect(safe).not.toMatch(/\p{Nd}{4,}/u);
    expect(safe).not.toContain('989121234567');
    expect(safe).not.toContain('۴۵۶۷۸۹');
    expect(safe).not.toContain('١٢٣٤٥٦');
  });

  it('removes addresses, links and obvious credentials from failure messages', () => {
    const safe = redactQueueFailure('Failed https://sms.example.test/send?token=secret-link to sara@example.test Bearer secret-bearer password=secret-password apiKey: secret-key token="secret-token"');
    for (const sensitive of ['sms.example.test', 'sara@example.test', 'secret-link', 'secret-bearer', 'secret-password', 'secret-key', 'secret-token']) expect(safe).not.toContain(sensitive);
  });

  it('flattens multiline failures, truncates at 200 characters and accepts an empty reason', () => {
    const safe = redactQueueFailure(`صف ناموفق\nخط بعد\tجزئیات\r\n${'x'.repeat(300)}`);
    expect(safe).not.toMatch(/[\r\n\t]/);
    expect(safe).toHaveLength(200);
    expect(redactQueueFailure('')).toBe('');
  });
});

describe('withHealthTimeout: bounded probes without leaked timers', () => {
  it('returns a successful result and clears its timeout', async () => {
    vi.useFakeTimers();
    await expect(withHealthTimeout(async () => 'ready', 25)).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the dependency failure and clears its timeout', async () => {
    vi.useFakeTimers();
    const failure = new Error('controlled dependency failure');
    await expect(withHealthTimeout(async () => { throw failure; }, 25)).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a dependency that never settles and releases the timer', async () => {
    vi.useFakeTimers();
    const check = withHealthTimeout(() => new Promise<never>(() => undefined), 25);
    const refused = expect(check).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(25);
    await refused;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turns a synchronous probe failure into a rejected promise', async () => {
    const failure = new Error('synchronous failure');
    await expect(withHealthTimeout(() => { throw failure; })).rejects.toBe(failure);
  });
});
