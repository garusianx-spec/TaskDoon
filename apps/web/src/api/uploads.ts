import type { AttachmentView, UploadPlan } from '@taskin/contracts';
import { api } from './endpoints';
import { ApiProblem } from './http';

/**
 * Files go straight from the browser to object storage (RFC §11): the API plans the upload and
 * reserves the bytes, the browser sends them to the presigned URL(s), and the API then checks the
 * stored object's size and real type. The API never proxies the bytes.
 */

/** What the browser says the file is; the server sniffs the bytes and must agree. */
export function contentTypeOf(file: Blob, name: string): string {
  if (file.type) return file.type.toLowerCase();
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const known: Readonly<Record<string, string>> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv' };
  return known[extension] ?? 'application/octet-stream';
}

/** Uploads one file into the workspace and returns it (status `scanning` until the scan passes). */
export async function uploadFile(workspaceId: string, file: Blob, fileName: string): Promise<AttachmentView> {
  const contentType = contentTypeOf(file, fileName);
  const planned = await api.files.plan(workspaceId, { fileName, size: file.size, contentType });
  const attachmentId = planned.attachment.id;
  try {
    const parts = await send(planned.plan, file, contentType);
    return await api.files.complete(workspaceId, attachmentId, parts ? { parts } : {});
  } catch (error) {
    await api.files.abort(workspaceId, attachmentId).catch(() => undefined);
    throw error;
  }
}

/** Sends the bytes as the plan says; returns the part ETags of a multipart upload. */
async function send(plan: UploadPlan, file: Blob, contentType: string): Promise<{ partNumber: number; etag: string }[] | null> {
  if (plan.kind === 'post') {
    await postForm(plan.url, plan.fields, file, contentType);
    return null;
  }
  const parts: { partNumber: number; etag: string }[] = [];
  for (const part of plan.parts) {
    const start = (part.partNumber - 1) * plan.partSize;
    const response = await fetch(part.url, { method: 'PUT', body: file.slice(start, start + plan.partSize) });
    const etag = response.headers.get('etag');
    if (!response.ok || !etag) throw storageProblem(response.status);
    parts.push({ partNumber: part.partNumber, etag });
  }
  return parts;
}

/** A presigned POST: the policy fields, the exact type the policy expects, then the file last. */
export async function postForm(url: string, fields: Readonly<Record<string, string>>, file: Blob, contentType: string): Promise<void> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  if (!('Content-Type' in fields)) form.append('Content-Type', contentType);
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', body: form });
  } catch {
    throw new ApiProblem(0, 'NETWORK', 'The file could not reach storage.', null);
  }
  if (!response.ok) throw storageProblem(response.status);
}

function storageProblem(status: number): ApiProblem {
  return new ApiProblem(status, 'UPLOAD_INVALID', 'The storage refused the file.', null);
}

/** A `data:` URL (the workspace-icon picker keeps one) as the bytes it holds. */
export async function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}
