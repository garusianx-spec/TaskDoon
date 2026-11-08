import type { PublishedSiteDocument, SiteAuditEntry, SiteDocument, SiteDocumentInput, SiteDocumentKind, SiteMedia, SiteRedirect, SiteRevision, SiteSubmission, SiteSubmissionKind } from '@taskin/contracts';
import { http, query } from '@/api/http';

const BASE = '/admin/site';
const documentPath = (id: string) => `${BASE}/documents/${encodeURIComponent(id)}`;
function writeOptions() {
  if (typeof document === 'undefined') return {};
  for (const name of ['__Host-taskin_csrf', 'taskin_csrf']) {
    const found = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    if (found) return { headers: { 'x-csrf-token': decodeURIComponent(found.slice(name.length + 1)) } };
  }
  return {};
}
const writes = {
  post: <T>(path: string, body?: unknown) => http.post<T>(path, body, writeOptions()),
  put: <T>(path: string, body?: unknown) => http.put<T>(path, body, writeOptions()),
  patch: <T>(path: string, body?: unknown) => http.patch<T>(path, body, writeOptions()),
  delete: <T>(path: string) => http.delete<T>(path, undefined, writeOptions()),
};

export interface SubmissionFilters { kind?: SiteSubmissionKind; status?: string; q?: string; page?: number; limit?: number }
export interface SubmissionPage { items: SiteSubmission[]; total: number; page: number; limit: number }

/** All requests reuse the existing administrator bearer session and password step-up. */
export const siteApi = {
  publicDocuments: () => http.get<PublishedSiteDocument[]>('/public/site/documents', { authenticated: false }),
  documents: (filters: { kind?: SiteDocumentKind; q?: string } = {}) => http.get<SiteDocument[]>(`${BASE}/documents${query(filters)}`),
  document: (id: string) => http.get<SiteDocument>(documentPath(id)),
  create: (body: SiteDocumentInput) => writes.post<SiteDocument>(`${BASE}/documents`, body),
  save: (id: string, body: SiteDocumentInput) => writes.put<SiteDocument>(documentPath(id), body),
  publish: (id: string) => writes.post<SiteDocument>(`${documentPath(id)}/publish`),
  unpublish: (id: string) => writes.post<SiteDocument>(`${documentPath(id)}/unpublish`),
  archive: (id: string) => writes.post<SiteDocument>(`${documentPath(id)}/archive`),
  preview: (id: string) => http.get<SiteDocument>(`${documentPath(id)}/preview`),
  revisions: (id: string) => http.get<SiteRevision[]>(`${documentPath(id)}/revisions`),
  restore: (id: string, revisionId: string) => writes.post<SiteDocument>(`${documentPath(id)}/restore`, { revisionId }),
  submissions: (filters: SubmissionFilters) => http.get<SubmissionPage>(`${BASE}/submissions${query({ ...filters })}`),
  submission: (id: string) => http.get<SiteSubmission>(`${BASE}/submissions/${encodeURIComponent(id)}`),
  updateSubmission: (id: string, body: { status?: SiteSubmission['status']; notes?: string }) => writes.patch<SiteSubmission>(`${BASE}/submissions/${encodeURIComponent(id)}`, body),
  redirects: () => http.get<SiteRedirect[]>(`${BASE}/redirects`),
  createRedirect: (body: { fromPath: string; toPath: string }) => writes.post<SiteRedirect>(`${BASE}/redirects`, body),
  deleteRedirect: (id: string) => writes.delete<void>(`${BASE}/redirects/${encodeURIComponent(id)}`),
  activity: () => http.get<SiteAuditEntry[]>(`${BASE}/activity`),
  media: (q?: string) => http.get<SiteMedia[]>(`${BASE}/media${query({ q })}`),
  mediaUpload: (body: { filename: string; contentType: string; size: number; alt: string }) => writes.post<{ media: SiteMedia; upload: { url: string; fields: Record<string, string> } }>(`${BASE}/media`, body),
  mediaComplete: (id: string) => writes.post<SiteMedia>(`${BASE}/media/${encodeURIComponent(id)}/complete`),
  updateMedia: (id: string, body: { alt?: string; archive?: boolean }) => writes.patch<SiteMedia>(`${BASE}/media/${encodeURIComponent(id)}`, body),
};
