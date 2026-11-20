import { describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ post: vi.fn(), form: vi.fn() }));
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  http: { post: api.post },
}));
vi.mock('@/api/uploads', async (original) => ({
  ...(await original<typeof import('@/api/uploads')>()),
  postForm: api.form,
}));
import { queueSupportFiles, supportFileError, uploadSupportFiles } from '@/features/support/support-client';
const file = () => new File(['synthetic'], 'sample.txt', { type: 'text/plain' });
describe('support upload boundaries and safe retry', () => {
  it('accepts bounded text and rejects unsupported or empty files', () => {
    expect(supportFileError([file()])).toBeNull();
    expect(supportFileError([new File([], 'empty.txt', { type: 'text/plain' })])).toContain('حجم');
    expect(supportFileError([new File(['x'], 'a.exe', { type: 'application/octet-stream' })])).toContain(
      'مجاز',
    );
    expect(supportFileError(Array.from({ length: 6 }, file))).toContain('۵');
  });
  it('reuses completed uploads after a message failure', async () => {
    const files = queueSupportFiles([file()]);
    api.post
      .mockResolvedValueOnce({
        id: 'ready-file',
        status: 'pending',
        plan: { url: 'https://upload.test', fields: {} },
      })
      .mockResolvedValueOnce({ id: 'ready-file', status: 'ready' });
    api.form.mockResolvedValue(undefined);
    expect(await uploadSupportFiles(files, { workspaceId: 'synthetic' })).toEqual(['ready-file']);
    const calls = api.post.mock.calls.length;
    expect(await uploadSupportFiles(files, { workspaceId: 'synthetic' })).toEqual(['ready-file']);
    expect(api.post.mock.calls).toHaveLength(calls);
  });
  it('uses a new upload reservation when the selected workspace changes', async () => {
    const files = queueSupportFiles([file()]);
    api.post
      .mockResolvedValueOnce({ id: 'first', status: 'ready' })
      .mockResolvedValueOnce({ id: 'second', status: 'ready' });
    expect(await uploadSupportFiles(files, { workspaceId: 'one' })).toEqual(['first']);
    const command = files[0]!.commandId;
    expect(await uploadSupportFiles(files, { workspaceId: 'two' })).toEqual(['second']);
    expect(files[0]!.commandId).not.toBe(command);
  });
  it('retains the original file and reservation command on a recoverable network failure', async () => {
    const files = queueSupportFiles([file()]);
    const id = files[0]!.commandId;
    api.post.mockRejectedValueOnce(new Error('offline'));
    await expect(uploadSupportFiles(files, { workspaceId: 'synthetic' })).rejects.toThrow('offline');
    expect(files[0]!.commandId).toBe(id);
    expect(files[0]!.file.name).toBe('sample.txt');
    expect(files[0]!.readyId).toBeUndefined();
  });
});
