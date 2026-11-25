import type { PublishedSiteDocument } from '@taskin/contracts';
import { getSiteDocuments, getSitePage } from '@/lib/site-public';
import { DocumentPage } from '@/features/marketing/components/DocumentPage';
import { DocumentCards } from '@/features/marketing/components/Sections';
import { SiteLink } from '@/features/marketing/components/SiteLink';
import { DocumentIcon } from '@/components/icons';

/** Published collection documents remain optional; an empty collection is a valid page. */
export async function CollectionPage({
  slug,
  kind,
  title,
}: {
  slug: string;
  kind: 'article' | 'help';
  title: string;
}) {
  const [document, documents] = await Promise.all([getSitePage(slug), getSiteDocuments()]);
  if (document) return <DocumentPage document={document} documents={documents} />;
  const entries: PublishedSiteDocument[] = documents.filter((entry) => entry.kind === kind);
  const hasFaq = documents.some((entry) => entry.kind === 'page' && entry.slug === 'faq');
  const hasContact = documents.some((entry) => entry.kind === 'page' && entry.slug === 'contact');

  return (
    <>
      <header className="marketing-container marketing-page-intro">
        <h1>{title}</h1>
      </header>
      <section className="marketing-section">
        <div className="marketing-container">
          {entries.length ? (
            <DocumentCards documents={entries} />
          ) : (
            <div className="marketing-empty mx-auto flex max-w-2xl flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15 bg-[#090d16] px-6 py-12 text-center shadow-xl sm:px-10 sm:py-16">
              <span
                className="flex size-14 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-blue-400"
                aria-hidden="true"
              >
                <DocumentIcon size={28} variant="twotone" />
              </span>
              <h2 className="text-lg font-bold text-white sm:text-xl">
                هنوز محتوایی در این بخش منتشر نشده است.
              </h2>
              <p className="max-w-md text-sm leading-7 text-zinc-400">
                {kind === 'help'
                  ? 'مستندات و راهنماهای گام‌به‌گام تسک‌دون در حال آماده‌سازی است. تا زمان انتشار، پاسخ بسیاری از پرسش‌ها در بخش پرسش‌های متداول در دسترس شماست.'
                  : 'مقالات آموزشی و راهنماهای تخصصی مدیریت پروژه به‌زودی در این بخش منتشر می‌شوند.'}
              </p>
              {kind === 'help' && (hasFaq || hasContact) && (
                <div className="mt-2 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
                  {hasFaq && (
                    <SiteLink
                      href="/faq"
                      className="marketing-button marketing-button-primary min-h-[44px] w-full sm:w-auto"
                    >
                      مشاهده پرسش‌های متداول
                    </SiteLink>
                  )}
                  {hasContact && (
                    <SiteLink
                      href="/contact"
                      className="marketing-button marketing-button-secondary min-h-[44px] w-full sm:w-auto"
                    >
                      ارتباط با پشتیبانی
                    </SiteLink>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
