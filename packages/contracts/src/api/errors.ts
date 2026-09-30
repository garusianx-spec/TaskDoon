/**
 * Machine-readable error codes. Every non-2xx API response is RFC 9457 `application/problem+json`
 * carrying one of these in `code`; the web client localises by code, never by `title`.
 */
export type ApiErrorCode =
  // Request shape
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'PRECONDITION_REQUIRED'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'SERVICE_UNAVAILABLE'
  // Authentication
  | 'UNAUTHENTICATED'
  | 'AUTH_EXPIRED'
  | 'AUTH_INVALID'
  | 'SESSION_REVOKED'
  | 'STEP_UP_REQUIRED'
  | 'CSRF_FAILED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_ATTEMPTS_EXCEEDED'
  | 'SIGNUP_TOKEN_INVALID'
  | 'SMS_UNAVAILABLE'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_INVALID'
  | 'PASSWORD_TOO_WEAK'
  | 'ACCOUNT_LOCKED'
  | 'REFRESH_INVALID'
  // Authorisation
  | 'FORBIDDEN'
  | 'OWNER_IMMUTABLE'
  | 'ROLE_RANK_VIOLATION'
  | 'PRIVILEGE_ESCALATION'
  // Idempotency
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  // Workspaces and members
  | 'WORKSPACE_NAME_MISMATCH'
  | 'PLAN_LIMIT_REACHED'
  | 'INVITATION_INVALID'
  | 'INVITATION_ADDRESS_MISMATCH'
  | 'ALREADY_MEMBER'
  | 'UPLOAD_INVALID'
  | 'DEPARTMENT_IN_USE'
  // Projects, board and tasks
  | 'PROJECT_KEY_TAKEN'
  | 'PROJECT_ARCHIVED'
  | 'COLUMN_GONE'
  | 'WORKFLOW_CATEGORY_REQUIRED'
  | 'BOARD_CHANGED'
  | 'SUBTASKS_CHANGED'
  | 'ASSIGNEE_NO_ACCESS'
  // Notes
  | 'NOTE_CATEGORY_IN_USE'
  // Chat and realtime
  | 'CONVERSATION_ARCHIVED'
  | 'POSTING_RESTRICTED'
  | 'DIRECT_CONVERSATION'
  | 'PROJECT_CHANNEL'
  | 'EDIT_WINDOW_CLOSED'
  | 'MESSAGE_GONE'
  | 'MESSAGE_NOT_CONVERTIBLE'
  | 'NOT_SUBSCRIBED'
  | 'SCHEDULED_MESSAGE_CLOSED'
  | 'SCHEDULE_LIMIT_REACHED'
  // Platform administration
  | 'PASSWORD_RESET_REQUIRED'
  | 'RESET_TOKEN_INVALID'
  | 'PLATFORM_ADMIN_UNAVAILABLE';

export interface FieldError {
  /** Dotted path of the offending field, e.g. `recipients.2.address`. */
  readonly field: string;
  readonly message: string;
}

/** RFC 9457 problem details, as every error response body. */
export interface ProblemDetails {
  /** A stable URI naming the problem type: `https://taskin.ir/problems/<code-in-kebab-case>`. */
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly detail?: string;
  /** Correlates the response with server logs, traces and audit rows. */
  readonly requestId: string;
  readonly errors?: readonly FieldError[];
  /** With 412 PRECONDITION_FAILED: the resource as it is now, so the client can merge. */
  readonly current?: unknown;
}
