import type { SchemaObject } from '@nestjs/swagger';
import { siteContentOpenApi, siteDocumentOpenApi } from './site.validation.js';

export const siteDocumentInputSchema = siteDocumentOpenApi as SchemaObject;
const content = siteContentOpenApi as SchemaObject;
export const publicSiteDocumentSchema: SchemaObject = {
  ...content,
  required: [...(content.required ?? []), 'id', 'kind', 'slug', 'publishedAt', 'updatedAt', 'version'],
  properties: { ...content.properties, id: { type: 'string', format: 'uuid' }, kind: siteDocumentInputSchema.properties?.kind ?? { type: 'string' }, slug: { type: 'string' }, publishedAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, version: { type: 'integer' } },
};
export const adminSiteDocumentSchema: SchemaObject = {
  type: 'object', required: ['id', 'kind', 'slug', 'title', 'status', 'draft', 'published', 'version', 'createdAt', 'updatedAt', 'publishedAt'],
  properties: { id: { type: 'string', format: 'uuid' }, kind: siteDocumentInputSchema.properties?.kind ?? { type: 'string' }, slug: { type: 'string' }, title: { type: 'string' }, status: { type: 'string', enum: ['draft', 'published', 'archived'] }, draft: content, published: { ...content, nullable: true }, version: { type: 'integer' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, publishedAt: { type: 'string', format: 'date-time', nullable: true } },
};
export const siteSubmissionSchema: SchemaObject = {
  type: 'object', additionalProperties: false, required: ['kind', 'fullName', 'message', 'consent'],
  description: 'Provide at least one email or phone. Job applications require a published jobId. Five requests per IP per 15 minutes. website is a honeypot and must be empty.',
  properties: { kind: { type: 'string', enum: ['contact', 'collaboration', 'demo', 'application'] }, fullName: { type: 'string', minLength: 2, maxLength: 120 }, email: { type: 'string', format: 'email', maxLength: 254 }, phone: { type: 'string', minLength: 7, maxLength: 32 }, subject: { type: 'string', maxLength: 200 }, message: { type: 'string', minLength: 10, maxLength: 10000 }, company: { type: 'string', maxLength: 200 }, teamSize: { type: 'string', maxLength: 80 }, jobId: { type: 'string', format: 'uuid' }, website: { type: 'string', maxLength: 0 }, consent: { type: 'boolean', enum: [true] } },
};
