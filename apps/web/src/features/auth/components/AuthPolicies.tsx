'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const POLICIES = [
  { slug: 'terms', label: 'شرایط استفاده' },
  { slug: 'privacy', label: 'حریم خصوصی' },
] as const;

type Policy = (typeof POLICIES)[number];

async function loadPolicies(signal: AbortSignal): Promise<readonly Policy[]> {
  const response = await fetch('/api/v1/public/site/documents?kind=page', {
    credentials: 'omit',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) return [];
  const pages: { slug: string }[] = await response.json();
  return POLICIES.filter((policy) => pages.some((page) => page.slug === policy.slug));
}

/** Show policies only after the CMS has published them. Sign-in never waits for the CMS. */
export function AuthPolicies() {
  const [published, setPublished] = useState<readonly Policy[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    void loadPolicies(controller.signal)
      .then((policies) => {
        if (!controller.signal.aborted) setPublished(policies);
      })
      .catch(() => {
        /* Policy discovery is optional for sign-in. */
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  if (!published.length) return null;
  return (
    <nav className="auth-policies" aria-label="شرایط و حریم خصوصی">
      {published.map(({ slug, label }) => (
        <Link key={slug} href={`/${slug}`} prefetch={false}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
