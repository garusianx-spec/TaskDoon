'use client';

import { useId,useState } from 'react';
import { Avatar,Badge,Button } from '@/components/ui';
import { CalendarIcon,CheckIcon,MessagesIcon,TaskSquareIcon } from '@/components/icons';
import { DemoTask } from '@/components/public/DemoTask';
import { ProductPreview } from '@/features/marketing/components/ProductPreview';

const PREVIEWS = [
  { id: 'kanban', title: 'پروژه و وظایف', description: 'پروژه، مسئول هر کار و وضعیت انجام را کنار هم ببینید.', media: { src: '/marketing/kanban.png', alt: 'برد کانبان واقعی تسک‌دون با دادهٔ نمونه', width: 1440, height: 960 } },
  { id: 'chat', title: 'گفتگوی تیمی', description: 'گفتگوها و فایل‌های مرتبط با کار در یک مسیر مشترک می‌مانند.', media: { src: '/marketing/chat.png', alt: 'گفتگوی تیمی در محیط واقعی تسک‌دون با دادهٔ نمونه', width: 1440, height: 960 } },
  { id: 'calendar', title: 'تقویم شمسی', description: 'برنامه و مهلت‌های تیم را با تاریخ‌های آشنا مرور کنید.', media: { src: '/marketing/calendar.png', alt: 'تقویم شمسی واقعی تسک‌دون با دادهٔ نمونه', width: 1440, height: 960 } },
  { id: 'notes', title: 'یادداشت‌ها', description: 'تصمیم‌ها و یادداشت‌های جلسه را به کارهای قابل پیگیری تبدیل کنید.', media: { src: '/marketing/notes.png', alt: 'دفترچهٔ یادداشت واقعی تسک‌دون با دادهٔ نمونه', width: 1440, height: 960 } },
];

/** Desktop uses captures of the running product; mobile gets readable shared controls. */
export function WorkspacePreview() {
  const [view, setView] = useState(0);
  const [done, setDone] = useState(false);
  const id = useId();
  return <div className="workspace-preview">
    <div className="workspace-preview-desktop"><ProductPreview items={PREVIEWS} priority /></div>
    <div className="workspace-preview-mobile">
      <div className="mobile-workspace-heading"><span className="mobile-workspace-mark"><TaskSquareIcon size={22} /></span><div><strong>تیم محصول</strong><span>فضای کاری نمونه</span></div><Avatar name="کاربر نمونه" initials="سا" tone="brand" size="sm" /></div>
      <div className="mobile-preview-switch" role="group" aria-label="نمای محصول در موبایل">{[{ label: 'وظایف', icon: TaskSquareIcon }, { label: 'گفتگو', icon: MessagesIcon }, { label: 'تقویم', icon: CalendarIcon }].map(({ label, icon: Icon }, index) => <button key={label} aria-pressed={view === index} aria-controls={`${id}-mobile-panel`} type="button" onClick={() => setView(index)}><Icon size={17} />{label}</button>)}</div>
      <div className="mobile-preview-body" id={`${id}-mobile-panel`}>
        {view === 0 && <><div className="mobile-preview-title"><h3>کار بعدی تیم</h3><Badge tone="neutral">پروژهٔ محصول</Badge></div><DemoTask done={done} /><Button fullWidth variant="secondary" size="sm" iconStart={<CheckIcon size={18} />} onClick={() => setDone(value => !value)}>{done ? 'بازگرداندن کار نمونه' : 'تکمیل کار نمونه'}</Button><span role="status" className="sr-only">{done ? 'کار نمونه انجام شد.' : ''}</span></>}
        {view === 1 && <div className="mobile-sample-chat"><Avatar name="سارا، عضو نمونه" initials="سا" tone="brand" size="sm" /><div><strong>سارا احمدی</strong><p>نسخهٔ موبایل آماده است. بازبینی نهایی را در برد پروژه پیگیری کنیم.</p><button type="button" onClick={() => setView(0)}>دیدن وظیفهٔ مرتبط</button></div></div>}
        {view === 2 && <div className="mobile-sample-calendar"><h3>برنامهٔ ۲۴ آبان</h3><p><CalendarIcon size={20} />بازبینی صفحهٔ معرفی محصول</p><span>مسئول: سارا احمدی</span><Button variant="secondary" fullWidth onClick={() => setView(0)}>دیدن جزئیات وظیفه</Button></div>}
      </div>
    </div>
    <p className="demo-disclosure">محیط واقعی تسک‌دون، با دادهٔ نمونه برای آشنایی با محصول</p>
  </div>;
}
