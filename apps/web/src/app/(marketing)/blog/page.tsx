import { getSitePage, getSiteSettings, siteMetadata, siteOrigin } from '@/lib/site-public';
import { CollectionPage } from '@/features/marketing/components/CollectionPage';
export async function generateMetadata() {
  const page = await getSitePage('blog');
  return page
    ? siteMetadata(page)
    : {
        title: { absolute: 'مقاله‌ها | تسک‌دون' },
        alternates: { canonical: `${siteOrigin(await getSiteSettings())}/blog` },
      };
}
export default function BlogPage() {
  return <CollectionPage slug="blog" kind="article" title="مقاله‌ها و آموزش‌های تسک‌دون" />;
}
