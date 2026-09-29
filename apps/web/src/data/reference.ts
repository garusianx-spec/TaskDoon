import type {
  BoardColumn,
  CalendarEventKind,
  ChatFilterId,
  Department,
  DepartmentId,
  ModuleDescriptor,
  PermissionActionDescriptor,
  PermissionModuleDescriptor,
  RoleDescriptor,
  RoleId,
  NoteCategory,
  NotificationFilterId,
  PresenceState,
  SemanticTone,
  TagTone,
  TaskPriority,
  TaskStatus,
} from '@taskin/contracts';
import { DEFAULT_PERMISSION_MATRIX } from '@taskin/contracts';

/* ------------------------------ Navigation ------------------------------ */

/** Rail order: work first — tasks sit directly under the workspace home, chats beneath them. */

export const MODULES: readonly ModuleDescriptor[] = [
  { id: 'feed', label: 'میز کار', href: '/feed' },
  { id: 'tasks', label: 'پروژه‌ها و وظایف', href: '/tasks' },
  { id: 'chats', label: 'گفتگوها', href: '/chats' },
  { id: 'calendar', label: 'تقویم', href: '/calendar' },
  { id: 'notes', label: 'یادداشت‌ها', href: '/notes' },
  { id: 'directory', label: 'اعضای سازمان', href: '/directory' },
];

/* ------------------------------ Presence ------------------------------ */

export const PRESENCE_OPTIONS: ReadonlyArray<{
  readonly id: PresenceState;
  readonly label: string;
  readonly description: string;
}> = [
  { id: 'online', label: 'آنلاین', description: 'در دسترس برای گفتگو' },
  { id: 'busy', label: 'مشغول', description: 'اعلان‌ها بی‌صدا می‌شوند' },
  { id: 'away', label: 'خارج از دسترس', description: 'به‌زودی برمی‌گردم' },
  { id: 'offline', label: 'نامرئی', description: 'آفلاین نمایش داده شوید' },
];

export const departmentName = (id: DepartmentId): string =>
  DEPARTMENTS.find((entry) => entry.id === id)?.name ?? id;

/* ------------------------------ Departments ------------------------------ */

export const DEPARTMENTS: readonly Department[] = [
  { id: 'engineering', name: 'مهندسی و توسعه', memberCount: 14 },
  { id: 'product', name: 'محصول', memberCount: 6 },
  { id: 'design', name: 'طراحی تجربه کاربری', memberCount: 5 },
  { id: 'marketing', name: 'بازاریابی', memberCount: 8 },
  { id: 'finance', name: 'مالی و اداری', memberCount: 4 },
  { id: 'operations', name: 'عملیات و پشتیبانی', memberCount: 9 },
];

/* ------------------------------ Task vocabulary ------------------------------ */

export const TASK_STATUSES: ReadonlyArray<{
  readonly id: TaskStatus;
  readonly label: string;
  readonly tone: SemanticTone;
}> = [
  { id: 'todo', label: 'برای انجام', tone: 'todo' },
  { id: 'in-progress', label: 'در حال انجام', tone: 'progress' },
  { id: 'review', label: 'منتظر تایید', tone: 'review' },
  { id: 'done', label: 'انجام شد', tone: 'done' },
];

export const TASK_PRIORITIES: ReadonlyArray<{
  readonly id: TaskPriority;
  readonly label: string;
  readonly tone: SemanticTone;
}> = [
  { id: 'urgent', label: 'فوری', tone: 'blocked' },
  { id: 'high', label: 'بالا', tone: 'progress' },
  { id: 'medium', label: 'متوسط', tone: 'review' },
  { id: 'low', label: 'پایین', tone: 'todo' },
];

export const statusLabel = (status: TaskStatus): string =>
  TASK_STATUSES.find((entry) => entry.id === status)?.label ?? status;

export const statusTone = (status: TaskStatus): SemanticTone =>
  TASK_STATUSES.find((entry) => entry.id === status)?.tone ?? 'todo';

export const priorityLabel = (priority: TaskPriority): string =>
  TASK_PRIORITIES.find((entry) => entry.id === priority)?.label ?? priority;

export const priorityTone = (priority: TaskPriority): SemanticTone =>
  TASK_PRIORITIES.find((entry) => entry.id === priority)?.tone ?? 'todo';

/* ------------------------------ Board ------------------------------ */

/**
 * The four built-in columns, one per workflow status, as views across projects («همه وظایف»,
 * the smart views) show them: every task sits in the column of its status. Their ids are the
 * status ids, so a task with `boardColumnId: null` resolves to the column whose id is its status.
 */
export const BUILT_IN_COLUMNS: readonly BoardColumn[] = TASK_STATUSES.map((entry) => ({
  id: entry.id,
  title: entry.label,
  status: entry.id,
  tone: null,
  custom: false,
}));

/** A project's own copy of the four built-in columns: every project's board starts with these. */
export const builtInColumnsFor = (projectId: string): BoardColumn[] =>
  BUILT_IN_COLUMNS.map((column) => ({ ...column, id: `${projectId}:${column.id}`, projectId }));

/**
 * Status a task takes when it is dropped into a user-made column. Custom columns model the
 * stages between "picked up" and "finished" (QA, blocked, awaiting client…), so their work
 * counts as in progress for filters, the Gantt palette and the feed's statistics.
 */
export const CUSTOM_COLUMN_STATUS: TaskStatus = 'in-progress';

export const TAG_TONES: ReadonlyArray<{ readonly id: TagTone; readonly label: string }> = [
  { id: 'gray', label: 'خاکستری' },
  { id: 'blue', label: 'آبی' },
  { id: 'teal', label: 'سبزآبی' },
  { id: 'green', label: 'سبز' },
  { id: 'amber', label: 'کهربایی' },
  { id: 'red', label: 'قرمز' },
  { id: 'pink', label: 'صورتی' },
  { id: 'violet', label: 'بنفش' },
];

export const tagToneLabel = (tone: TagTone): string =>
  TAG_TONES.find((entry) => entry.id === tone)?.label ?? tone;

/* ------------------------------ Calendar ------------------------------ */

export const CALENDAR_EVENT_KINDS: ReadonlyArray<{
  readonly id: CalendarEventKind;
  readonly label: string;
  readonly description: string;
}> = [
  { id: 'meeting', label: 'جلسه', description: 'زمان‌بندی با شرکت‌کنندگان' },
  { id: 'reminder', label: 'یادآور', description: 'یک یادآوری برای خودتان' },
  { id: 'milestone', label: 'نقطه عطف پروژه', description: 'یک موعد کلیدی در پروژه' },
];

export const calendarEventKindLabel = (kind: CalendarEventKind): string =>
  CALENDAR_EVENT_KINDS.find((entry) => entry.id === kind)?.label ?? kind;

/* ------------------------------ Notes ------------------------------ */

export const BUILT_IN_NOTE_CATEGORIES: readonly NoteCategory[] = [
  { id: 'personal', label: 'شخصی', builtIn: true },
  { id: 'work', label: 'کاری', builtIn: true },
  { id: 'ideas', label: 'ایده‌ها', builtIn: true },
  { id: 'meetings', label: 'صورت‌جلسه‌ها', builtIn: true },
];

/** Where a note goes when it is created under "همه". */
export const DEFAULT_NOTE_CATEGORY_ID = 'personal';

/* ------------------------------ Notifications ------------------------------ */

export const NOTIFICATION_FILTERS: ReadonlyArray<{
  readonly id: NotificationFilterId;
  readonly label: string;
}> = [
  { id: 'all', label: 'همه' },
  { id: 'unread', label: 'خوانده‌نشده' },
  { id: 'mentions', label: 'اشاره‌ها' },
];

/* ------------------------------ Chat filters ------------------------------ */

export const CHAT_FILTERS: ReadonlyArray<{ readonly id: ChatFilterId; readonly label: string }> = [
  { id: 'all', label: 'همه' },
  { id: 'direct', label: 'شخصی' },
  { id: 'groups', label: 'گروه‌ها' },
  { id: 'unread', label: 'خوانده‌نشده' },
];

/* ------------------------------ Reactions ------------------------------ */

/** The quick-reaction palette, shared by the desktop hover bar and the mobile action sheet. */
export const QUICK_REACTIONS: ReadonlyArray<{ readonly emoji: string; readonly label: string }> = [
  { emoji: '👍', label: 'پسندیدم' },
  { emoji: '❤️', label: 'قلب' },
  { emoji: '🔥', label: 'عالی' },
  { emoji: '🙏', label: 'سپاس' },
  { emoji: '✅', label: 'انجام شد' },
  { emoji: '👀', label: 'در حال بررسی' },
  { emoji: '👎', label: 'نپسندیدم' },
];

/* ------------------------------ RBAC vocabulary ------------------------------ */

export const ROLES: readonly RoleDescriptor[] = [
  {
    id: 'owner',
    name: 'مالک سازمان',
    description: 'دسترسی کامل و غیرقابل تغییر به تمام بخش‌های فضای کاری',
    locked: true,
    memberCount: 1,
    rank: 0,
  },
  {
    id: 'admin',
    name: 'مدیر سیستم',
    description: 'مدیریت اعضا، تنظیمات سازمان و همه پروژه‌ها',
    locked: false,
    memberCount: 3,
    rank: 1,
  },
  {
    id: 'manager',
    name: 'مدیر پروژه',
    description: 'مدیریت بوردها، ارجاع وظایف و تایید خروجی تیم',
    locked: false,
    memberCount: 7,
    rank: 2,
  },
  {
    id: 'member',
    name: 'عضو تیم',
    description: 'انجام وظایف محول‌شده و مشارکت در گفتگوهای تیمی',
    locked: false,
    memberCount: 28,
    rank: 3,
  },
  {
    id: 'guest',
    name: 'همکار مهمان',
    description: 'دسترسی محدود و فقط‌خواندنی به پروژه‌های مشخص',
    locked: false,
    memberCount: 5,
    rank: 4,
  },
];

export const PERMISSION_MODULES: readonly PermissionModuleDescriptor[] = [
  { id: 'messages', name: 'پیام‌ها و کانال‌ها', description: 'گفتگوهای خصوصی، گروه‌ها و کانال‌های سازمانی' },
  { id: 'boards', name: 'بوردها و پروژه‌ها', description: 'بوردهای کانبان، وظایف و زمان‌بندی پروژه' },
  { id: 'files', name: 'اسناد و فایل‌ها', description: 'مخزن فایل پروژه‌ها و پیوست گفتگوها' },
  { id: 'reports', name: 'گزارش‌های عملکرد و تایم‌شیت', description: 'گزارش‌های تحلیلی، بهره‌وری و ثبت ساعت کاری' },
  { id: 'members', name: 'مدیریت اعضا و دسترسی‌ها', description: 'دعوت اعضا، تخصیص نقش و تنظیم سطح دسترسی' },
];

export const PERMISSION_ACTIONS: readonly PermissionActionDescriptor[] = [
  { id: 'view', name: 'مشاهده', shortName: 'مشاهده' },
  { id: 'create', name: 'ایجاد', shortName: 'ایجاد' },
  { id: 'edit', name: 'ویرایش', shortName: 'ویرایش' },
  { id: 'delete', name: 'حذف', shortName: 'حذف' },
  { id: 'assign', name: 'ارجاع و تغییر وضعیت', shortName: 'ارجاع' },
];

/** Shipping defaults, shared with the API's role seeds. The RBAC screen edits a working copy. */
export { DEFAULT_PERMISSION_MATRIX };

export const roleLabel = (role: RoleId): string =>
  ROLES.find((entry) => entry.id === role)?.name ?? role;
