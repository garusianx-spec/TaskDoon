import { getSitePage, getSiteSettings, siteMetadata, siteOrigin } from '@/lib/site-public';
import { CollectionPage } from '@/components/marketing/CollectionPage';
export async function generateMetadata() {
  const page = await getSitePage('help');
  return page ? siteMetadata(page) : { title: 'مرکز راهنما | تسک‌دون', alternates: { canonical: `${siteOrigin(await getSiteSettings())}/help` } };
}
export default function HelpPage() { return <CollectionPage slug="help" kind="help" title="مرکز راهنمای تسک‌دون" />; }
