import { HttpException } from '@nestjs/common';
import type { ApiErrorCode, FieldError } from '@taskin/contracts';

/** HTTP status and a short English title for every error code (the client localises by code). */
export const ERROR_CATALOGUE: Readonly<Record<ApiErrorCode, { readonly status: number; readonly title: string }>> = {
  VALIDATION_FAILED: { status: 400, title: 'The request is not valid' },
  NOT_FOUND: { status: 404, title: 'Not found' },
  CONFLICT: { status: 409, title: 'Conflicts with the current state' },
  PRECONDITION_FAILED: { status: 412, title: 'The resource changed since you read it' },
  PRECONDITION_REQUIRED: { status: 428, title: 'This request needs If-Match' },
  RATE_LIMITED: { status: 429, title: 'Too many requests' },
  INTERNAL: { status: 500, title: 'Something went wrong' },
  SERVICE_UNAVAILABLE: { status: 503, title: 'Temporarily unavailable' },
  UNAUTHENTICATED: { status: 401, title: 'Sign in first' },
  AUTH_EXPIRED: { status: 401, title: 'The access token expired' },
  AUTH_INVALID: { status: 401, title: 'The access token is not valid' },
  SESSION_REVOKED: { status: 401, title: 'This session was signed out' },
  STEP_UP_REQUIRED: { status: 401, title: 'Confirm your password to continue' },
  CSRF_FAILED: { status: 403, title: 'The request did not come from the Taskin app' },
  OTP_INVALID: { status: 400, title: 'The code is not correct' },
  OTP_EXPIRED: { status: 400, title: 'The code expired' },
  OTP_ATTEMPTS_EXCEEDED: { status: 429, title: 'Too many wrong codes' },
  SIGNUP_TOKEN_INVALID: { status: 400, title: 'Verify your phone number again' },
  SMS_UNAVAILABLE: { status: 503, title: 'SMS delivery is unavailable' },
  PASSWORD_REQUIRED: { status: 409, title: 'Set a password first' },
  PASSWORD_INVALID: { status: 401, title: 'The password is not correct' },
  PASSWORD_TOO_WEAK: { status: 400, title: 'The password is too weak' },
  ACCOUNT_LOCKED: { status: 423, title: 'Too many wrong passwords' },
  REFRESH_INVALID: { status: 401, title: 'Sign in again' },
  FORBIDDEN: { status: 403, title: 'Not allowed' },
  OWNER_IMMUTABLE: { status: 403, title: 'The owner cannot be changed this way' },
  ROLE_RANK_VIOLATION: { status: 403, title: 'You can only manage roles below your own' },
  PRIVILEGE_ESCALATION: { status: 403, title: 'You cannot grant a permission you do not hold' },
  IDEMPOTENCY_KEY_REQUIRED: { status: 428, title: 'This request needs an Idempotency-Key' },
  IDEMPOTENCY_KEY_REUSED: { status: 422, title: 'The Idempotency-Key was used for a different request' },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, title: 'The same request is still being processed' },
  WORKSPACE_NAME_MISMATCH: { status: 422, title: 'The name does not match' },
  PLAN_LIMIT_REACHED: { status: 402, title: 'The plan limit is reached' },
  INVITATION_INVALID: { status: 410, title: 'The invitation is no longer valid' },
  INVITATION_ADDRESS_MISMATCH: { status: 403, title: 'The invitation was sent to another number' },
  ALREADY_MEMBER: { status: 409, title: 'Already a member' },
  UPLOAD_INVALID: { status: 422, title: 'The uploaded file is not acceptable' },
  DEPARTMENT_IN_USE: { status: 409, title: 'The department still has members or invitations' },
  PROJECT_KEY_TAKEN: { status: 409, title: 'Another project uses that key' },
  PROJECT_ARCHIVED: { status: 409, title: 'The project is archived' },
  COLUMN_GONE: { status: 409, title: 'The column was deleted' },
  WORKFLOW_CATEGORY_REQUIRED: { status: 409, title: 'The board needs at least one to-do and one done column' },
  BOARD_CHANGED: { status: 409, title: 'The board changed; reload it' },
  SUBTASKS_CHANGED: { status: 409, title: 'The subtasks changed; reload the task' },
  ASSIGNEE_NO_ACCESS: { status: 422, title: 'An assignee cannot see this project' },
  NOTE_CATEGORY_IN_USE: { status: 409, title: 'The category still has notes' },
  CONVERSATION_ARCHIVED: { status: 409, title: 'The conversation is archived' },
  POSTING_RESTRICTED: { status: 403, title: 'Only the channel admins can post here' },
  DIRECT_CONVERSATION: { status: 409, title: 'A direct chat always has exactly its two people' },
  PROJECT_CHANNEL: { status: 409, title: 'A project channel\'s members are the project\'s: add or remove them in the project' },
  EDIT_WINDOW_CLOSED: { status: 409, title: 'The message can no longer be edited' },
  MESSAGE_GONE: { status: 410, title: 'The message was deleted' },
  MESSAGE_NOT_CONVERTIBLE: { status: 422, title: 'Only a text, file or voice message becomes a task' },
  NOT_SUBSCRIBED: { status: 409, title: 'Subscribe to the workspace first' },
};

/**
 * The one exception type domain code throws. The problem filter renders it as RFC 9457
 * `application/problem+json` with the request id attached.
 */
export class ApiError extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    readonly detail?: string,
    readonly fieldErrors?: readonly FieldError[],
    /** Extra response headers, e.g. `Retry-After`. */
    readonly headers?: Readonly<Record<string, string>>,
  ) {
    super(detail ?? ERROR_CATALOGUE[code].title, ERROR_CATALOGUE[code].status);
    this.name = 'ApiError';
  }

  static validation(fieldErrors: readonly FieldError[], detail = 'Some fields are not valid.'): ApiError {
    return new ApiError('VALIDATION_FAILED', detail, fieldErrors);
  }

  static notFound(what = 'The resource'): ApiError {
    return new ApiError('NOT_FOUND', `${what} was not found.`);
  }

  static forbidden(detail?: string): ApiError {
    return new ApiError('FORBIDDEN', detail);
  }

  static rateLimited(retryAfterSeconds: number, detail?: string): ApiError {
    return new ApiError('RATE_LIMITED', detail, undefined, { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) });
  }

  /**
   * 412: the client's `If-Match` (or `expectedVersion`) is stale. Carries the resource as it is now
   * and its version as the `ETag`, so the client can merge field by field without another request.
   */
  static stale(current: { readonly version: number }): ApiError {
    const error = new ApiError('PRECONDITION_FAILED', undefined, undefined, { ETag: `"${current.version}"` });
    error.current = current;
    return error;
  }

  /** With PRECONDITION_FAILED: the current representation (see `stale`). */
  current?: unknown;
}

/**
 * Reads a strong or weak `If-Match` version (`"3"`, `W/"3"` or `3`). `undefined` when the header
 * is missing (428), a validation error when it is not a version.
 */
export function parseIfMatch(header: string | undefined): number | undefined {
  if (header === undefined || header.trim() === '') return undefined;
  const match = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim());
  if (!match?.[1]) throw ApiError.validation([{ field: 'If-Match', message: 'must be the version, e.g. "3"' }]);
  return Number(match[1]);
}

/** Like `parseIfMatch`, but the header is required. */
export function requireIfMatch(header: string | undefined): number {
  const version = parseIfMatch(header);
  if (version === undefined) throw new ApiError('PRECONDITION_REQUIRED');
  return version;
}
