'use client';

import Link from 'next/link';
import { siteApi } from '@/admin/site-api';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Loaded, PageHeader, Panel } from '@/components/admin/AdminUi';
import { RelativeTime } from '@/components/ui';
import { KINDS } from './SiteFields';

export const SITE_SECTIONS = [
  { path: '', label: 'پیشخوان', description: 'نمای کلی انتشار و درخواست‌ها' },
  { path: 'pages', label: 'صفحه‌ها', description: 'متن و چیدمان صفحات عمومی' },
  { path: 'features', label: 'امکانات', description: 'معرفی قابلیت‌های واقعی محصول' },
  { path: 'pricing', label: 'قیمت‌گذاری', description: 'طرح‌ها و مقایسه امکانات' },
  { path: 'blog', label: 'وبلاگ', description: 'مقاله‌ها و محتوای تحریریه' },
  { path: 'faqs', label: 'پرسش‌ها', description: 'دسته‌ها و پاسخ‌های متداول' },
  { path: 'careers', label: 'فرصت‌های شغلی', description: 'موقعیت‌های شغلی تأییدشده' },
  { path: 'help', label: 'راهنما', description: 'محتوای مرکز راهنما' },
  { path: 'reusable', label: 'محتوای مشترک', description: 'بخش‌های قابل استفاده دوباره' },
  { path: 'media', label: 'رسانه‌ها', description: 'تصویر، متن جایگزین و بارگذاری' },
  { path: 'navigation', label: 'ناوبری', description: 'پیوندهای سربرگ و پابرگ' },
  { path: 'settings', label: 'تنظیمات', description: 'هویت، تماس و تنظیمات عمومی' },
  { path: 'seo', label: 'سئو', description: 'متادیتا، تغییر مسیر و نقشه سایت' },
  { path: 'contacts', label: 'پیام‌های تماس', description: 'صندوق پیام‌های بازدیدکنندگان' },
  { path: 'collaborations', label: 'درخواست همکاری', description: 'پیشنهادهای همکاری و شراکت' },
  { path: 'demo-requests', label: 'درخواست دمو', description: 'سرنخ‌های تجاری' },
  { path: 'applications', label: 'درخواست استخدام', description: 'بررسی درخواست‌های شغلی' },
  { path: 'activity', label: 'گزارش فعالیت', description: 'تاریخچه فعالیت مدیران سایت' },
] as const;

export function SiteDashboard() {
  const page = useAdminLoad('site-dashboard', async () => { const [documents, inbox] = await Promise.all([siteApi.documents(), siteApi.submissions({ status: 'new', page: 1, limit: 5 })]); return { documents, inbox }; });
  return <><PageHeader title="مدیریت وب‌سایت" description="از پیش‌نویس تا انتشار؛ محتوای عمومی، رسانه‌ها و درخواست‌های تسک‌دون را از یک‌جا مدیریت کنید." /><Loaded load={page}>{({ documents, inbox }) => <><div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ title: 'محتوای منتشرشده', count: documents.filter((entry) => entry.status === 'published').length }, { title: 'پیش‌نویس‌ها', count: documents.filter((entry) => entry.status === 'draft').length }, { title: 'نیازمند بازبینی', count: documents.filter((entry) => entry.draft.data.approvalRequired === true).length }, { title: 'درخواست‌های جدید', count: inbox.total }].map((stat) => <div key={stat.title} className="rounded-xl border border-secondary bg-surface p-5"><p className="text-body-sm text-fg-tertiary">{stat.title}</p><p className="mt-2 text-3xl font-bold text-fg-primary">{stat.count.toLocaleString('fa-IR')}</p></div>)}</div><Panel title="ادامه ویرایش"><div className="divide-y divide-secondary">{[...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map((document) => <Link key={document.id} href={`/admin/site/pages/${document.id}`} className="flex items-center justify-between gap-4 rounded-lg py-3 text-body-sm hover:bg-hover"><div><p className="font-semibold text-fg-primary">{document.title}</p><p className="mt-1 text-caption text-fg-tertiary">{KINDS[document.kind]} · {document.slug}</p></div><span className="shrink-0 text-caption text-fg-tertiary"><RelativeTime iso={document.updatedAt} /></span></Link>)}</div></Panel></>}</Loaded><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{SITE_SECTIONS.filter((section) => section.path).map((section) => <Link key={section.path} href={`/admin/site/${section.path}`} className="rounded-xl border border-secondary bg-surface p-5 transition-colors hover:border-brand hover:bg-brand-subtle"><p className="text-body font-semibold text-fg-primary">{section.label}</p><p className="mt-2 text-body-sm text-fg-tertiary">{section.description}</p></Link>)}</div></>;
}
