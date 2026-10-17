import { z } from 'zod';
import type { SiteContent, SiteDocumentInput, SiteDocumentKind, SiteSubmissionInput } from '@taskin/contracts';
import { ApiError } from '../../platform/http/api-error.js';

export const DOCUMENT_KINDS = ['page', 'feature', 'article', 'help', 'faq', 'pricing', 'job', 'settings', 'navigation', 'reusable'] as const;
const text = (max: number) => z.string().trim().max(max).refine((value) => !/<\/?[a-z][^>]*>/i.test(value), 'HTML is not supported; use plain text or Markdown');
const path = z.string().trim().min(1).max(300).regex(/^\/(?!\/)[\p{L}\p{N}/_.~-]*$/u, 'must be a local path without a query or fragment');
export const safeLink = z.string().trim().min(1).max(2048).refine((value) => {
  if (/[\u0000-\u0020\\<>]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|5c|2f)/i.test(value) || value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  if (/^#[\p{L}\p{N}_-]+$/u.test(value)) return true;
  if (/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|tel:\+?[\d-]{7,20})$/i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}, 'must be a safe local, HTTPS, mailto or telephone link');
const mediaLink = safeLink.refine((value) => value.startsWith('/') || value.startsWith('https://'), 'must be a local or HTTPS image');
const link = z.object({ label: text(120).min(1), href: safeLink }).strict();
const media = z.object({ src: mediaLink, alt: text(300), width: z.number().int().min(1).max(12000).optional(), height: z.number().int().min(1).max(12000).optional() }).strict();
const item = z.object({ id: text(100).optional(), title: text(300), description: text(3000).optional(), href: safeLink.optional(), media: media.optional(), label: text(120).optional() }).strict();
const section = z.object({
  id: z.string().min(1).max(100).regex(/^[\w-]+$/),
  type: z.enum(['hero', 'rich-text', 'feature-grid', 'benefits', 'image-text', 'video', 'statistics', 'steps', 'product-preview', 'testimonials', 'pricing-preview', 'faq', 'cta', 'logos', 'content-grid', 'contact-form', 'separator', 'reusable']),
  title: text(300).optional(), subtitle: text(500).optional(), description: text(5000).optional(), body: text(50000).optional(),
  media: media.optional(), cta: link.optional(), secondaryCta: link.optional(),
  variant: z.enum(['default', 'subtle', 'brand']).optional(), layout: z.enum(['center', 'split', 'grid']).optional(),
  visible: z.boolean(), items: z.array(item).max(100).optional(), referenceId: z.uuid().optional(),
  formKind: z.enum(['contact', 'collaboration', 'demo', 'application']).optional(), sortOrder: z.number().int().min(0).max(1000).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict();
const seo = z.object({
  title: text(200).optional(), description: text(500).optional(), canonical: mediaLink.optional(), noIndex: z.boolean().optional(),
  ogTitle: text(200).optional(), ogDescription: text(500).optional(), ogImage: mediaLink.optional(),
  twitterTitle: text(200).optional(), twitterDescription: text(500).optional(), twitterImage: mediaLink.optional(),
  keyword: text(200).optional(), breadcrumbs: z.array(link).max(20).optional(),
}).strict();
const content = z.object({ title: text(300).min(1), description: text(5000), sections: z.array(section).max(100), seo, data: z.record(z.string(), z.unknown()) }).strict();
const document = z.object({ kind: z.enum(DOCUMENT_KINDS), slug: z.string().min(1).max(160).regex(/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u), draft: content, version: z.number().int().positive().optional() }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw ApiError.validation(result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
  return result.data;
}

/** Data extensions stay JSON-only, bounded, and subject to the same safe-text/link rules. */
function validateData(value: unknown, field: string, depth = 0): void {
  if (depth > 8) throw ApiError.validation([{ field, message: 'data nesting exceeds 8 levels' }]);
  if (typeof value === 'string') {
    parse(text(50000), value);
    if (/(?:^|\.)(?:href|src|url|siteUrl|canonical|ogImage|twitterImage)$/i.test(field)) parse(safeLink, value);
  } else if (Array.isArray(value)) {
    if (value.length > 200) throw ApiError.validation([{ field, message: 'array exceeds 200 items' }]);
    value.forEach((item, index) => validateData(item, `${field}.${index}`, depth + 1));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (/^(?:__proto__|prototype|constructor|token|script|html)$/i.test(key) || /(?:password|secret|(?:access|refresh|auth)[_-]?token|api[_-]?key|private[_-]?key|credential|smtp|database[_-]?url)/i.test(key)) throw ApiError.validation([{ field: `${field}.${key}`, message: 'this field is not allowed in public content' }]);
      validateData(child, `${field}.${key}`, depth + 1);
    }
  } else if (value !== null && typeof value !== 'boolean' && typeof value !== 'number') throw ApiError.validation([{ field, message: 'must be JSON data' }]);
}

export function validateSiteDocument(value: unknown): SiteDocumentInput {
  const input = parse(document, value);
  if (new Set(input.draft.sections.map((block) => block.id)).size !== input.draft.sections.length) throw ApiError.validation([{ field: 'draft.sections', message: 'section IDs must be unique' }]);
  validateData(input.draft.data, 'draft.data');
  for (const [index, block] of input.draft.sections.entries()) validateData(block.data ?? {}, `draft.sections.${index}.data`);
  if (JSON.stringify(input).length > 500000) throw ApiError.validation([{ field: 'draft', message: 'document exceeds 500 KB' }]);
  if (input.kind === 'page' && ['feed', 'tasks', 'chats', 'chat', 'calendar', 'notes', 'directory', 'settings', 'more', 'invite', 'signed-out', 'reset-password', 'admin', 'api', 'health', 'projects', 'notifications', 'login', 'signup'].includes(input.slug)) throw ApiError.validation([{ field: 'slug', message: 'this path is reserved for the application' }]);
  if ((input.kind === 'settings' && input.slug !== 'global') || (input.kind === 'navigation' && input.slug !== 'main')) throw ApiError.validation([{ field: 'slug', message: 'site settings use global and navigation uses main as a singleton key' }]);
  const data = input.draft.data;
  if (input.kind === 'pricing') {
    parse(z.object({ planId: z.enum(['free', 'team', 'enterprise']), price: z.number().nonnegative().optional(), yearlyPrice: z.number().nonnegative().optional(), currency: z.string().regex(/^[A-Z]{3}$/), features: z.array(text(500)).max(100), limits: z.array(z.object({ label: text(100), value: text(200) }).strict()).optional(), cta: link, recommended: z.boolean().optional(), priceApproved: z.boolean().optional() }).passthrough(), data);
    if (data.planId !== 'free' && (data.price !== undefined || data.yearlyPrice !== undefined) && data.priceApproved !== true) throw ApiError.validation([{ field: 'draft.data.priceApproved', message: 'confirmed business approval is required before a paid price is published' }]);
  }
  if (input.kind === 'pricing' && data.planId === 'free' && (data.price !== 0 || (data.yearlyPrice !== undefined && data.yearlyPrice !== 0))) throw ApiError.validation([{ field: 'draft.data.price', message: 'the free plan must have a zero price' }]);
  if (input.kind === 'faq') parse(z.object({ category: text(100), answer: text(10000).min(1) }).passthrough(), data);
  if (input.kind === 'navigation') parse(z.object({ header: z.array(link).max(40), footer: z.array(link).max(60), social: z.array(link).max(20) }).passthrough(), data);
  if (input.kind === 'settings') parse(z.object({ siteName: text(120).min(1), description: text(5000), primaryCta: link, siteUrl: z.url().startsWith('https://').optional(), contactEmail: z.email().optional() }).passthrough(), data);
  if (input.kind === 'job') parse(z.object({ employmentType: text(120).min(1), location: text(200).min(1), requirements: z.array(text(1000)).min(1).max(100) }).passthrough(), data);
  return input;
}

export function validateSitePublish(kind: SiteDocumentKind, slug: string, draft: SiteContent): void {
  validateSiteDocument({ kind, slug, draft });
  if (kind === 'page' && ['terms', 'privacy'].includes(slug) && draft.data.legalApproved !== true) throw ApiError.validation([{ field: 'draft.data.legalApproved', message: 'legal and business review is required before publishing this policy' }]);
  if (draft.sections.some((block) => block.visible && ((block.media && !block.media.alt.trim()) || block.items?.some((item) => item.media && !item.media.alt.trim())))) throw ApiError.validation([{ field: 'draft.sections.media.alt', message: 'published images require descriptive alternative text' }]);
}

export function validateSubmission(value: unknown): SiteSubmissionInput {
  return parse(z.object({
    kind: z.enum(['contact', 'collaboration', 'demo', 'application']), fullName: text(120).min(2),
    email: z.email().max(254).optional(), phone: z.string().trim().min(7).max(32).regex(/^[+0-9۰-۹٠-٩\s()-]+$/).optional(),
    subject: text(200).optional(), message: text(10000).min(10), company: text(200).optional(), teamSize: text(80).optional(),
    jobId: z.uuid().optional(), website: z.string().max(0).optional(), consent: z.literal(true),
  }).strict().refine((value) => !!value.email || !!value.phone, { path: ['email'], message: 'provide an email address or phone number' }).refine((value) => value.kind !== 'application' || !!value.jobId, { path: ['jobId'], message: 'an application requires a published job opening' }), value);
}

export const validateInboxUpdate = (value: unknown) => parse(z.object({ status: z.enum(['new', 'in-progress', 'closed', 'archived']).optional(), notes: text(10000).optional() }).strict().refine((value) => value.status !== undefined || value.notes !== undefined), value);
export const validateRedirect = (value: unknown) => parse(z.object({ fromPath: path, toPath: path }).strict().refine((value) => value.fromPath !== value.toPath), value);
export const validateMediaInput = (value: unknown) => parse(z.object({ filename: text(200).min(1).refine((value) => !/[\/\\]/.test(value), 'filename cannot contain path separators'), contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']), size: z.number().int().positive().max(10485760), alt: text(300).min(1) }).strict(), value);
export const validateMediaUpdate = (value: unknown) => parse(z.object({ alt: text(300).min(1).optional(), archive: z.boolean().optional() }).strict(), value);
export const validateRevision = (value: unknown) => parse(z.object({ revisionId: z.uuid() }).strict(), value);
export const parseKind = (value?: string): SiteDocumentKind | undefined => value === undefined ? undefined : parse(z.enum(DOCUMENT_KINDS), value);

/** OpenAPI shares the same section and draft schema as the runtime validator. */
export const siteDocumentOpenApi = z.toJSONSchema(document, { target: 'openapi-3.0' });
export const siteContentOpenApi = z.toJSONSchema(content, { target: 'openapi-3.0' });
