import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';

export interface PresignedPost {
  readonly url: string;
  readonly fields: Record<string, string>;
}

export interface StoredObject {
  readonly size: number;
  readonly contentType: string | undefined;
}

/** RFC 5987 `filename*` encoding: percent-encode everything outside attr-char. */
export function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * The storage port over any S3-compatible store (SeaweedFS in development, MinIO or Ceph RGW in
 * production). Browsers upload and download directly with short-lived signed requests, so file
 * bytes never pass through the API. Presigning uses the public endpoint (what browsers can reach);
 * everything else uses the internal one.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  readonly bucket: string;
  private readonly internal: S3Client;
  private readonly signer: S3Client;

  constructor(config: AppConfig) {
    const env = config.env;
    this.bucket = env.S3_BUCKET;
    const common = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      // By default the SDK signs a CRC32 of the (empty) body into presigned part URLs, so every
      // real part fails with BadDigest. Checksums only where an operation requires one.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.internal = new S3Client({ ...common, endpoint: env.S3_ENDPOINT });
    this.signer = new S3Client({ ...common, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT });
  }

  /**
   * A browser upload with the size and type limits enforced by the store itself: a body outside
   * `[minBytes, maxBytes]` or with another Content-Type is refused before it is stored.
   */
  async presignPost(
    key: string,
    options: { maxBytes: number; minBytes?: number; contentTypePrefix: string; expiresInSeconds: number },
  ): Promise<PresignedPost> {
    const { url, fields } = await createPresignedPost(this.signer, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', options.minBytes ?? 1, options.maxBytes],
        ['starts-with', '$Content-Type', options.contentTypePrefix],
      ],
      Expires: options.expiresInSeconds,
    });
    return { url, fields };
  }

  /**
   * A short-lived link. Named files download (`attachment`) unless the caller vetted them for
   * showing in place (`inline`: sniffed images, audio and video); the name is in RFC 5987 form so
   * Persian names survive, and the type is the sniffed one.
   */
  async presignGet(
    key: string,
    expiresInSeconds: number,
    downloadName?: string,
    contentType?: string,
    disposition: 'attachment' | 'inline' = 'attachment',
  ): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: downloadName ? `${disposition}; filename*=UTF-8''${encodeRfc5987(downloadName)}` : undefined,
        ResponseContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  /* ---------------------------------------------------------------- multipart (files over 16 MB) */

  async createMultipart(key: string, contentType: string): Promise<string> {
    const created = await this.internal.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    if (!created.UploadId) throw new Error('the store returned no multipart upload id');
    return created.UploadId;
  }

  async presignPart(key: string, uploadId: string, partNumber: number, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.signer, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), {
      expiresIn: expiresInSeconds,
    });
  }

  async completeMultipart(key: string, uploadId: string, parts: readonly { partNumber: number; etag: string }[]): Promise<void> {
    await this.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) },
      }),
    );
  }

  async abortMultipart(key: string, uploadId: string): Promise<void> {
    await this.internal.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }

  /** Size and type of an object, or `null` when it does not exist. */
  async head(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: head.ContentLength ?? 0, contentType: head.ContentType };
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw error;
    }
  }

  /** The first `length` bytes, for sniffing a file's real type from its magic number. */
  async readPrefix(key: string, length: number): Promise<Buffer> {
    const object = await this.internal.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${length - 1}` }));
    const bytes = await object.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async copy(from: string, to: string, contentType: string): Promise<void> {
    await this.internal.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(from).replaceAll('%2F', '/')}`,
        Key: to,
        ContentType: contentType,
        MetadataDirective: 'REPLACE',
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.internal.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Deletes every object under `prefix` (a purged workspace's files). Returns the count. */
  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.internal.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
      if (keys.length > 0) {
        await this.internal.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  async ping(): Promise<void> {
    await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  onModuleDestroy(): void {
    this.internal.destroy();
    this.signer.destroy();
  }
}
