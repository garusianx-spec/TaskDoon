import type { ApiErrorCode } from '@taskin/contracts';
import { ApiProblem } from './http';

/** What a failed call means to the person using the app, in Persian. */
const MESSAGES: Partial<Record<ApiErrorCode | 'NETWORK', string>> = {
  NETWORK: 'ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.',
  SERVICE_UNAVAILABLE: 'سرور موقتاً پاسخ نمی‌دهد. چند لحظه دیگر دوباره تلاش کنید.',
  RATE_LIMITED: 'درخواست‌ها بیش از حد مجاز بود. کمی صبر کنید.',
  FORBIDDEN: 'اجازه انجام این کار را ندارید.',
  NOT_FOUND: 'این مورد دیگر وجود ندارد.',
  PRECONDITION_FAILED: 'همزمان کس دیگری این مورد را تغییر داده بود؛ آخرین نسخه بارگذاری شد.',
  CONFLICT: 'این تغییر با وضعیت فعلی سازگار نیست.',
  VALIDATION_FAILED: 'اطلاعات واردشده معتبر نیست.',
  OTP_INVALID: 'کد واردشده درست نیست.',
  OTP_EXPIRED: 'کد منقضی شده است؛ کد تازه‌ای بگیرید.',
  OTP_ATTEMPTS_EXCEEDED: 'تعداد تلاش‌ها بیش از حد مجاز شد؛ کد تازه‌ای بگیرید.',
  SIGNUP_TOKEN_INVALID: 'مهلت ثبت‌نام تمام شد؛ دوباره وارد شوید.',
  SMS_UNAVAILABLE: 'ارسال پیامک ممکن نشد. کمی بعد دوباره تلاش کنید.',
  PASSWORD_REQUIRED: 'ابتدا باید رمز مدیر تعیین کنید.',
  PASSWORD_INVALID: 'رمز عبور درست نیست.',
  PASSWORD_TOO_WEAK: 'رمز عبور ضعیف است؛ دست‌کم ۸ نویسه، با حروف و عدد یا نماد.',
  ACCOUNT_LOCKED: 'به‌دلیل تلاش‌های ناموفق، ورود با رمز موقتاً قفل شد.',
  STEP_UP_REQUIRED: 'برای این کار باید رمز مدیر را دوباره وارد کنید.',
  WORKSPACE_NAME_MISMATCH: 'نام فضای کاری درست وارد نشده است.',
  PLAN_LIMIT_REACHED: 'به سقف طرح فعلی رسیده‌اید.',
  INVITATION_INVALID: 'این دعوت‌نامه معتبر نیست یا منقضی شده است.',
  INVITATION_ADDRESS_MISMATCH: 'این دعوت‌نامه برای شماره موبایل دیگری فرستاده شده است.',
  ALREADY_MEMBER: 'شما از قبل عضو این فضای کاری هستید.',
  UPLOAD_INVALID: 'فایل پذیرفته نشد: نوع یا حجم آن مجاز نیست.',
  SUBTASKS_CHANGED: 'فهرست زیروظیفه‌ها همزمان تغییر کرده بود؛ به‌روز شد.',
  MESSAGE_NOT_CONVERTIBLE: 'این پیام را نمی‌توان به وظیفه تبدیل کرد.',
  PROJECT_KEY_TAKEN: 'این کلید را پروژه دیگری دارد؛ کلید دیگری انتخاب کنید.',
  PRIVILEGE_ESCALATION: 'نمی‌توانید دسترسی بیشتر از دسترسی خودتان بدهید.',
  COLUMN_GONE: 'این ستون دیگر وجود ندارد؛ بورد به‌روز شد.',
  WORKFLOW_CATEGORY_REQUIRED: 'بورد باید دست‌کم یک ستون «برای انجام» و یک ستون «انجام شد» داشته باشد.',
  BOARD_CHANGED: 'بورد همزمان تغییر کرده بود؛ به‌روز شد.',
  ASSIGNEE_NO_ACCESS: 'مسئول انتخاب‌شده به این پروژه دسترسی ندارد.',
  CONVERSATION_ARCHIVED: 'این گفتگو بایگانی شده است.',
  POSTING_RESTRICTED: 'در این کانال فقط مدیران می‌توانند پیام بفرستند.',
  SCHEDULED_MESSAGE_CLOSED: 'این پیام زمان‌بندی‌شده پیش‌تر ارسال یا لغو شده است.',
  SCHEDULE_LIMIT_REACHED: 'در هر گفتگو حداکثر ۱۰۰ پیام زمان‌بندی‌شده می‌تواند در انتظار باشد.',
  PROJECT_CHANNEL: 'اعضای کانال پروژه همان اعضای پروژه‌اند؛ آن‌ها را در خود پروژه اضافه یا حذف کنید.',
  EDIT_WINDOW_CLOSED: 'مهلت ویرایش این پیام گذشته است.',
  MESSAGE_GONE: 'این پیام حذف شده است.',
  NOTE_CATEGORY_IN_USE: 'این دفترچه هنوز یادداشت دارد.',
};

/** The text for an error code carried as data (a scheduled message's `failureCode`), if there is one. */
export function codeMessage(code: string | null): string | null {
  return code ? (MESSAGES[code as ApiErrorCode] ?? null) : null;
}

export function problemMessage(error: unknown, fallback = 'انجام این کار ممکن نشد.'): string {
  if (error instanceof ApiProblem) return MESSAGES[error.code] ?? error.body?.detail ?? fallback;
  return fallback;
}
