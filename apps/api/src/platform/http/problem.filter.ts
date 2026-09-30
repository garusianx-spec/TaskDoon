import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import type { ApiErrorCode, FieldError, ProblemDetails } from '@taskin/contracts';
import { RequestContext } from '../context/request-context.js';
import { isUnavailable, PG, pgError } from '../db/pg-errors.js';
import { ApiError, ERROR_CATALOGUE } from './api-error.js';

interface Rendered {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly current?: unknown;
  /** Logged at error level with the stack: a bug or an outage, not a client mistake. */
  readonly unexpected: boolean;
}

const kebab = (code: string) => code.toLowerCase().replaceAll('_', '-');

function fromStatus(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 412:
      return 'PRECONDITION_FAILED';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED';
  }
}

export function renderException(exception: unknown): Rendered {
  if (exception instanceof ApiError) {
    return {
      code: exception.code,
      status: exception.getStatus(),
      detail: exception.detail,
      errors: exception.fieldErrors,
      headers: exception.headers,
      current: exception.current,
      unexpected: exception.getStatus() >= 500,
    };
  }
  if (exception instanceof ThrottlerException) {
    return { code: 'RATE_LIMITED', status: 429, unexpected: false };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return { code: fromStatus(status), status, detail: exception.message, unexpected: status >= 500 };
  }
  // Express body-parser errors (malformed JSON, body over the 1 MB limit) carry their status.
  if (typeof exception === 'object' && exception !== null && 'type' in exception && 'status' in exception) {
    const status = Number((exception as { status: unknown }).status);
    if (status >= 400 && status < 500) {
      return { code: 'VALIDATION_FAILED', status, detail: 'The request body could not be read.', unexpected: false };
    }
  }
  if (isUnavailable(exception)) return { code: 'SERVICE_UNAVAILABLE', status: 503, headers: { 'Retry-After': '1' }, unexpected: true };
  const pg = pgError(exception);
  if (pg) {
    switch (pg.code) {
      case PG.uniqueViolation:
        return { code: 'CONFLICT', status: 409, detail: 'It already exists.', unexpected: false };
      case PG.foreignKeyViolation:
      case PG.restrictViolation:
        return { code: 'CONFLICT', status: 409, detail: 'It is still referenced, or refers to something missing.', unexpected: false };
      case PG.checkViolation:
      case PG.notNullViolation:
        return { code: 'VALIDATION_FAILED', status: 400, unexpected: false };
      case PG.ownerImmutable:
        return { code: 'OWNER_IMMUTABLE', status: 403, unexpected: false };
      case PG.workflowCategory:
        return { code: 'WORKFLOW_CATEGORY_REQUIRED', status: 409, unexpected: false };
      case PG.serializationFailure:
      case PG.deadlockDetected:
      case PG.lockNotAvailable:
        return { code: 'SERVICE_UNAVAILABLE', status: 503, headers: { 'Retry-After': '1' }, unexpected: true };
      case PG.insufficientPrivilege:
        // A row-level security refusal: application code tried to cross a tenant boundary.
        return { code: 'FORBIDDEN', status: 403, unexpected: true };
      default:
        return { code: 'INTERNAL', status: 500, unexpected: true };
    }
  }
  return { code: 'INTERNAL', status: 500, unexpected: true };
}

/** Renders every error as RFC 9457 problem details. Stack traces never reach the client. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemFilter');

  constructor(private readonly context: RequestContext) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const response = host.switchToHttp().getResponse<Response>();
    const rendered = renderException(exception);
    const requestId = this.context.requestId ?? 'unknown';

    if (rendered.unexpected) {
      const pg = pgError(exception);
      this.logger.error(
        {
          code: rendered.code,
          pgCode: pg?.code,
          constraint: pg?.constraint,
          // Only the name and stack: a DrizzleQueryError message contains the query parameters.
          errorName: exception instanceof Error ? exception.name : typeof exception,
          stack: exception instanceof Error && !pg ? exception.stack : undefined,
        },
        'request failed',
      );
    }

    const catalogue = ERROR_CATALOGUE[rendered.code];
    const body: ProblemDetails = {
      type: `https://taskin.ir/problems/${kebab(rendered.code)}`,
      title: catalogue.title,
      status: rendered.status,
      code: rendered.code,
      ...(rendered.detail && rendered.detail !== catalogue.title ? { detail: rendered.detail } : {}),
      requestId,
      ...(rendered.errors?.length ? { errors: rendered.errors } : {}),
      ...(rendered.current !== undefined ? { current: rendered.current } : {}),
    };
    if (response.headersSent) return;
    for (const [name, value] of Object.entries(rendered.headers ?? {})) response.setHeader(name, value);
    response.status(rendered.status).type('application/problem+json').send(JSON.stringify(body));
  }
}
