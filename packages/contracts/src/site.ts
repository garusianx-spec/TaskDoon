/** Platform-scoped editorial content. Operational workspace entitlements are separate. */
export type SiteDocumentKind = 'page' | 'feature' | 'article' | 'help' | 'faq' | 'pricing' | 'job' | 'settings' | 'navigation' | 'reusable';
export type SiteStatus = 'draft' | 'published' | 'archived';
export type SiteBlockType = 'hero' | 'rich-text' | 'feature-grid' | 'benefits' | 'image-text' | 'video' | 'statistics' | 'steps' | 'product-preview' | 'testimonials' | 'pricing-preview' | 'faq' | 'cta' | 'logos' | 'content-grid' | 'contact-form' | 'separator' | 'reusable';
export type SiteSubmissionKind = 'contact' | 'collaboration' | 'demo' | 'application';
export interface SiteLink { label: string; href: string }
export interface SiteMediaRef { src: string; alt: string; width?: number; height?: number }
export interface SiteItem { id?: string; title: string; description?: string; href?: string; media?: SiteMediaRef; label?: string }
export interface SiteSection {
  id: string; type: SiteBlockType; title?: string; subtitle?: string; description?: string;
  body?: string; media?: SiteMediaRef; cta?: SiteLink; secondaryCta?: SiteLink;
  variant?: 'default' | 'subtle' | 'brand'; layout?: 'center' | 'split' | 'grid';
  visible: boolean; items?: SiteItem[]; referenceId?: string; formKind?: SiteSubmissionKind; sortOrder?: number; data?: Record<string, unknown>;
}
export interface SiteSeo {
  title?: string; description?: string; canonical?: string; noIndex?: boolean;
  ogTitle?: string; ogDescription?: string; ogImage?: string; twitterTitle?: string;
  twitterDescription?: string; twitterImage?: string; keyword?: string; breadcrumbs?: SiteLink[];
}
export interface SiteContent {
  title: string; description: string; sections: SiteSection[]; seo: SiteSeo;
  data: Record<string, unknown>;
}
export interface SiteDocument {
  id: string; kind: SiteDocumentKind; slug: string; title: string; status: SiteStatus; draft: SiteContent; published: SiteContent | null; version: number;
  createdAt: string; updatedAt: string; publishedAt: string | null;
}
export interface PublishedSiteDocument extends SiteContent { id: string; kind: SiteDocumentKind; slug: string; publishedAt: string; updatedAt: string; version: number }
export interface SiteDocumentInput { kind: SiteDocumentKind; slug: string; draft: SiteContent; version?: number }
export interface SiteRevision { id: string; documentId: string; content: SiteContent; version: number; createdAt: string; actorId: string | null; action: string }
export interface SiteSubmissionInput {
  kind: SiteSubmissionKind; fullName: string; email?: string; phone?: string;
  subject?: string; message: string; company?: string; teamSize?: string;
  jobId?: string; website?: string; consent: boolean;
}
export interface SiteSubmission extends SiteSubmissionInput {
  id: string; status: 'new' | 'in-progress' | 'closed' | 'archived'; notes: string;
  createdAt: string; updatedAt: string;
}
export interface SiteMedia { id: string; src: string; alt: string; filename: string; contentType: string; size: number; createdAt: string; archivedAt: string | null }
export interface SiteRedirect { id: string; fromPath: string; toPath: string; createdAt: string }
export interface SiteAuditEntry { id: string; actorId: string | null; action: string; documentId: string | null; createdAt: string }
