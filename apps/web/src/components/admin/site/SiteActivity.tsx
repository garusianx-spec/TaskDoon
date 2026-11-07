'use client';

import Link from 'next/link';
import { siteApi } from '@/admin/site-api';
import { useAdminLoad } from '@/admin/use-admin-load';
import { Loaded, PageHeader, Panel, TABLE, TableFrame, TD, TH } from '@/components/admin/AdminUi';
import { Button, RelativeTime } from '@/components/ui';

const ACTIONS: Record<string, string> = { 'site.document.create': 'ایجاد محتوا', 'site.document.update': 'ذخیره پیش‌نویس', 'site.document.publish': 'انتشار', 'site.document.unpublish': 'لغو انتشار', 'site.document.archive': 'بایگانی', 'site.document.restore': 'بازیابی نسخه', 'site.media.create': 'ایجاد رسانه', 'site.media.complete': 'تکمیل بارگذاری', 'site.media.update': 'تغییر رسانه', 'site.submission.update': 'تغییر وضعیت درخواست', 'site.redirect.create': 'ثبت تغییر مسیر' };

export function SiteActivity() {
  const page = useAdminLoad('site-activity', () => siteApi.activity());
  return <><PageHeader title="گزارش فعالیت وب‌سایت" description="عملیات مدیران، شناسه ویرایشگر و زمان ثبت از گزارش سرور خوانده می‌شوند." actions={<Button variant="secondary" onClick={page.reload} loading={page.loading}>تازه‌سازی</Button>} /><Panel title="تازه‌ترین فعالیت‌ها"><Loaded load={page} empty={(entries) => entries.length === 0}>{(entries) => <TableFrame label="تاریخچه فعالیت وب‌سایت"><table className={TABLE}><thead><tr><th className={TH}>عملیات</th><th className={TH}>ویرایشگر</th><th className={TH}>محتوا</th><th className={TH}>زمان</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td className={TD}>{ACTIONS[entry.action] ?? entry.action}</td><td className={TD}><bdi>{entry.actorId ?? 'سیستم'}</bdi></td><td className={TD}>{entry.documentId ? <Link href={`/admin/site/pages/${entry.documentId}`} className="text-fg-brand hover:underline">مشاهده محتوا</Link> : '—'}</td><td className={TD}><RelativeTime iso={entry.createdAt} /></td></tr>)}</tbody></table></TableFrame>}</Loaded></Panel></>;
}
