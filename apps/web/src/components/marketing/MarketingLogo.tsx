import Image from 'next/image';
import { Logo } from '@/components/brand/Logo';
import { asText, siteMediaHref } from '@/lib/site-utils';

export function MarketingLogo({ value, name }: { value?: unknown; name: string }) {
  const media = value && typeof value === 'object' ? value as { src?: unknown; alt?: unknown } : null;
  const src = siteMediaHref(media?.src ?? value);
  if (!src) return <Logo className="h-7 sm:h-8" />;
  return <Image src={src} alt={asText(media?.alt, name)} width={230} height={32} className="h-8 w-auto max-w-[190px] object-contain" unoptimized />;
}
