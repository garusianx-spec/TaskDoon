import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { UploadTicket } from '@taskin/contracts';
import { AuditWriter } from '../../platform/audit/audit-writer.js';
import { UnitOfWork } from '../../platform/db/unit-of-work.js';
import { ApiError } from '../../platform/http/api-error.js';
import { StorageService } from '../../platform/storage/storage.js';

export const ICON_MAX_BYTES = 1024 * 1024;
const TICKET_TTL_SECONDS = 600;

const SIGNATURES: readonly { readonly type: string; readonly ext: string; readonly matches: (bytes: Buffer) => boolean }[] = [
  { type: 'image/png', ext: 'png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/jpeg', ext: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/webp', ext: 'webp', matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

/** What a file really is, by its magic number; never trust the uploaded Content-Type. */
export function sniffImage(bytes: Buffer): { type: string; ext: string } | null {
  return SIGNATURES.find((signature) => signature.matches(bytes)) ?? null;
}

/**
 * Workspace icons: the browser uploads to a temporary key with a presigned POST, then names that
 * key when creating or updating the workspace. The API checks size and real type and copies the
 * object under the workspace's prefix, where a purge can find it.
 */
@Injectable()
export class IconsService {
  constructor(
    private readonly storage: StorageService,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditWriter,
  ) {}

  async ticket(userId: string): Promise<UploadTicket> {
    const key = `tmp/icons/${userId}/${randomUUID()}`;
    const post = await this.storage.presignPost(key, { maxBytes: ICON_MAX_BYTES, contentTypePrefix: 'image/', expiresInSeconds: TICKET_TTL_SECONDS });
    await this.uow.run({ workspaceId: null, userId }, ({ tx }) =>
      this.audit.write(tx, { action: 'upload.ticket', resourceType: 'upload', resourceId: key }),
    );
    return {
      key,
      url: post.url,
      fields: post.fields,
      maxBytes: ICON_MAX_BYTES,
      contentTypes: SIGNATURES.map((signature) => signature.type),
      expiresInSeconds: TICKET_TTL_SECONDS,
    };
  }

  /** Validates an uploaded icon and moves it under the workspace. Returns its permanent key. */
  async claim(userId: string, uploadKey: string, workspaceId: string): Promise<string> {
    if (!uploadKey.startsWith(`tmp/icons/${userId}/`) || uploadKey.includes('..')) {
      throw new ApiError('UPLOAD_INVALID', 'That upload does not belong to you.');
    }
    const object = await this.storage.head(uploadKey);
    if (!object) throw new ApiError('UPLOAD_INVALID', 'The upload was not found; upload the icon again.');
    if (object.size > ICON_MAX_BYTES) throw new ApiError('UPLOAD_INVALID', 'The icon must be at most 1 MB.');
    const kind = sniffImage(await this.storage.readPrefix(uploadKey, 16));
    if (!kind) throw new ApiError('UPLOAD_INVALID', 'Only PNG, JPEG or WebP images can be icons.');
    const key = `ws/${workspaceId}/icon/${randomUUID()}.${kind.ext}`;
    await this.storage.copy(uploadKey, key, kind.type);
    await this.storage.delete(uploadKey).catch(() => undefined);
    return key;
  }
}
