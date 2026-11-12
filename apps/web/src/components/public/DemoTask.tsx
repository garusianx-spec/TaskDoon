import { Avatar, Badge } from '@/components/ui';
import { CheckCircleIcon, CalendarIcon } from '@/components/icons';

/** Uses the application's shared UI; all data belongs to the labeled public demonstration. */
export function DemoTask({
  done = false,
  title = 'بازبینی صفحهٔ معرفی محصول',
}: {
  readonly done?: boolean;
  readonly title?: string;
}) {
  return (
    <article className="demo-task">
      <div className="demo-task-top">
        <Badge tone={done ? 'done' : 'progress'} dot>
          {done ? 'انجام‌شده' : 'در حال انجام'}
        </Badge>
        <span>محصول</span>
      </div>
      <h3>{title}</h3>
      <p>جمع‌بندی بازخوردها و آماده‌سازی نسخهٔ نهایی</p>
      <div className="demo-task-bottom">
        <span>
          <CalendarIcon size={16} />
          ۲۴ آبان
        </span>
        <Avatar name="سارا احمدی، مسئول نمونه" initials="سا" tone="brand" size="xs" />
      </div>
      {done && (
        <span className="demo-task-complete">
          <CheckCircleIcon size={16} />
          بازبینی تکمیل شد
        </span>
      )}
    </article>
  );
}
