'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar, Badge, Button, Input } from '@/components/ui';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  MessagesIcon,
  TaskSquareIcon,
  BriefcaseIcon,
} from '@/components/icons';
import { DemoTask } from '@/components/public/DemoTask';

const STEPS = [
  { title: 'گفتگو', description: 'تصمیم، در متن گفتگو', icon: MessagesIcon },
  { title: 'وظیفه', description: 'یک کار با مسئول مشخص', icon: TaskSquareIcon },
  { title: 'پروژه', description: 'پیگیری تا انجام شدن', icon: BriefcaseIcon },
] as const;
const INITIAL_TASK_TITLE = 'بازبینی صفحهٔ معرفی محصول';

export function ProductJourney() {
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState(false);
  const [done, setDone] = useState(false);
  const [draftTitle, setDraftTitle] = useState(INITIAL_TASK_TITLE);
  const [taskTitle, setTaskTitle] = useState(INITIAL_TASK_TITLE);
  const [error, setError] = useState('');
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function selectAndFocus(next: number) {
    setStep(next);
    tabs.current[next]?.focus();
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = STEPS.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowLeft':
        next = (index + 1) % STEPS.length;
        break;
      case 'ArrowRight':
        next = (index + last) % STEPS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    selectAndFocus(next);
  }

  return (
    <div className="product-journey">
      <div className="journey-steps" role="tablist" aria-label="از گفتگو تا پیشرفت پروژه">
        {STEPS.map(({ title: label, description, icon: Icon }, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            ref={(node) => {
              tabs.current[index] = node;
            }}
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={step === index}
            tabIndex={step === index ? 0 : -1}
            onClick={() => setStep(index)}
            onKeyDown={(event) => onKey(event, index)}
          >
            <Icon size={22} />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <ArrowLeftIcon className="journey-arrow" size={18} />
          </button>
        ))}
      </div>
      <div className="journey-window">
        <div className="journey-window-bar">
          <div className="journey-window-controls" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="journey-window-title">تسک‌دون • پروژهٔ معرفی محصول</span>
          <Badge tone="neutral">نمونهٔ تعاملی</Badge>
        </div>
        {STEPS.map((_, index) => (
          <div
            key={index}
            role="tabpanel"
            id={`${id}-panel-${index}`}
            aria-labelledby={`${id}-tab-${index}`}
            hidden={step !== index}
            tabIndex={0}
          >
            {index === 0 && (
              <div className="journey-chat">
                <div className="journey-message">
                  <Avatar name="سارا، عضو نمونه" initials="سا" tone="brand" />
                  <div>
                    <strong>سارا احمدی</strong>
                    <small>امروز، ۱۰:۳۰</small>
                    <p>صفحهٔ معرفی آماده است. قبل از انتشار، متن‌ها و نسخهٔ موبایل را با هم بازبینی کنیم.</p>
                  </div>
                </div>
                <div className="journey-message">
                  <Avatar name="علی، عضو نمونه" initials="عر" tone="teal" />
                  <div>
                    <strong>علی رضایی</strong>
                    <small>امروز، ۱۰:۳۲</small>
                    <p>این تصمیم را به وظیفه تبدیل کنیم تا مسئول و مهلتش مشخص باشد.</p>
                    <Button size="sm" variant="secondary" onClick={() => selectAndFocus(1)}>
                      تبدیل پیام به وظیفه
                      <ArrowLeftIcon size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {index === 1 && (
              <form
                className="journey-task-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const title = draftTitle.trim();
                  if (!title) {
                    setError('عنوان وظیفه را بنویسید.');
                    return;
                  }
                  setTaskTitle(title);
                  setCreated(true);
                  setDone(false);
                  selectAndFocus(2);
                }}
              >
                <Badge tone="brand">برگرفته از گفتگوی تیم</Badge>
                <Input
                  label="عنوان وظیفهٔ نمونه"
                  value={draftTitle}
                  onChange={(event) => {
                    setDraftTitle(event.target.value);
                    setError('');
                  }}
                  maxLength={120}
                  error={error || undefined}
                />
                <div className="journey-details">
                  <span>
                    مسئول <strong>سارا احمدی</strong>
                  </span>
                  <span>
                    مهلت <strong>۲۴ آبان</strong>
                  </span>
                </div>
                <Button type="submit">
                  ساخت وظیفه در پیش‌نمایش
                  <ArrowLeftIcon size={18} />
                </Button>
              </form>
            )}
            {index === 2 && (
              <div className="journey-board">
                <div className="journey-board-heading">
                  <h3>برد پروژه</h3>
                  <span>{created ? 'وظیفهٔ شما به پروژه اضافه شد' : 'نمایی از پیگیری کارهای تیم'}</span>
                </div>
                <div className="journey-board-columns">
                  <div>
                    <h4>
                      <span className="demo-dot" />
                      برای انجام
                    </h4>
                    <div className="journey-placeholder">جمع‌بندی محتوا</div>
                  </div>
                  <div>
                    <h4>
                      <span className="demo-dot demo-dot-amber" />
                      در حال انجام
                    </h4>
                    {!done && <DemoTask title={taskTitle} />}
                  </div>
                  <div>
                    <h4>
                      <span className="demo-dot demo-dot-green" />
                      انجام‌شده
                    </h4>
                    {done ? (
                      <DemoTask done title={taskTitle} />
                    ) : (
                      <div className="journey-placeholder">آمادهٔ قدم بعدی</div>
                    )}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  iconStart={<CheckCircleIcon size={18} />}
                  onClick={() => setDone((value) => !value)}
                >
                  {done ? 'بازگرداندن وظیفهٔ نمونه' : 'تکمیل وظیفهٔ نمونه'}
                </Button>
                <p role="status" className="journey-live">
                  {done
                    ? 'وظیفه به ستون انجام‌شده منتقل شد.'
                    : created
                      ? 'می‌توانید وضعیت وظیفهٔ نمونه را در برد پیگیری کنید.'
                      : ''}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="demo-disclosure">
        این پیش‌نمایش با دادهٔ نمونه کار می‌کند و اطلاعاتی در فضای کاری شما ذخیره نمی‌کند.
      </p>
    </div>
  );
}
