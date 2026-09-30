import type { ApiErrorCode } from '@taskin/contracts';

/** Every REST route lives under this prefix, on the app's own origin (proxied to the API). */
export const API_PREFIX = '/api/v1';

/** An RFC 9457 problem, as the API sends it. */
export interface ProblemBody {
  readonly type?: string;
  readonly title?: string;
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly detail?: string;
  readonly requestId?: string;
  readonly errors?: ReadonlyArray<{ readonly field: string; readonly message: string }>;
  /** 412 responses carry the resource as it is now. */
  readonly current?: unknown;
}

/** A failed call: the API's problem, or `NETWORK` when no answer arrived at all. */
export class ApiProblem extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'NETWORK';
  readonly body: ProblemBody | null;

  constructor(status: number, code: ApiErrorCode | 'NETWORK', message: string, body: ProblemBody | null) {
    super(message);
    this.name = 'ApiProblem';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export const isProblem = (error: unknown, code?: ApiProblem['code']): error is ApiProblem =>
  error instanceof ApiProblem && (code === undefined || error.code === code);

/** How requests authenticate; installed by the session module, so this file has no state of its own. */
interface Credentials {
  readonly token: () => string | null;
  /** Gets a fresh access token; resolves false when the session is gone. */
  readonly refresh: () => Promise<boolean>;
}

let credentials: Credentials = { token: () => null, refresh: async () => false };

export function installCredentials(next: Credentials): void {
  credentials = next;
}

export interface RequestOptions {
  readonly body?: unknown;
  /** Adds an `Idempotency-Key`, so a retried create is applied once. */
  readonly idempotent?: boolean;
  /** Sends `If-Match` with this version. */
  readonly ifMatch?: number;
  readonly headers?: Readonly<Record<string, string>>;
  /** `false` for the sign-in calls, which carry no bearer token. */
  readonly authenticated?: boolean;
  readonly signal?: AbortSignal;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function send(method: string, path: string, options: RequestOptions, idempotencyKey: string | null): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  if (options.ifMatch !== undefined) headers['if-match'] = `"${options.ifMatch}"`;
  if (options.authenticated !== false) {
    const token = credentials.token();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  try {
    return await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiProblem(0, 'NETWORK', 'The server could not be reached.', null);
  }
}

/**
 * One API call. A 401 on an authenticated call refreshes the session once and retries with the
 * new token (with the same idempotency key); any other failure becomes an `ApiProblem`.
 */
export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const idempotencyKey = options.idempotent ? newIdempotencyKey() : null;
  let response = await send(method, path, options, idempotencyKey);
  if (response.status === 401 && options.authenticated !== false && (await credentials.refresh())) {
    response = await send(method, path, options, idempotencyKey);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const body = isProblemBody(parsed) ? parsed : null;
    throw new ApiProblem(response.status, body?.code ?? 'INTERNAL', body?.detail ?? body?.title ?? response.statusText, body);
  }
  return parsed as T;
}

function isProblemBody(value: unknown): value is ProblemBody {
  return typeof value === 'object' && value !== null && typeof (value as { code?: unknown }).code === 'string';
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('DELETE', path, { ...options, body }),
};

/** Query strings without empty values. */
export function query(params: Readonly<Record<string, string | number | boolean | null | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
