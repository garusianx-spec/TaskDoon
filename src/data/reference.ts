import type {
  BoardColumn,
  ChatFilterId,
  Department,
  ModuleDescriptor,
  PermissionActionDescriptor,
  PermissionActionId,
  PermissionMatrix,
  PermissionModuleDescriptor,
  RoleDescriptor,
  RoleId,
  SemanticTone,
  TaskPriority,
  TaskStatus,
} from '@/types';

/* ------------------------------ Navigation ------------------------------ */

export const MODULES: readonly ModuleDescriptor[] = [
  { id: 'feed', label: 'میز کار', href: '/feed' },
  { id: 'chats', label: 'گفتگوها', href: '/chats' },
  { id: 'tasks', label: 'پروژه‌ها و وظایف', href: '/tasks' },
  { id: 'calendar', label: 'تقویم و یادداشت', href: '/calendar' },
  { id: 'directory', label: 'اعضای سازمان', href: '/directory' },
];

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

/**
 * The four built-in columns. Their ids match the canonical statuses, so a task with no
 * explicit column lands in the right place and custom columns simply add to this list.
 */
export const DEFAULT_BOARD_COLUMNS: readonly BoardColumn[] = TASK_STATUSES.map((status) => ({
  id: status.id,
  title: status.label,
  tone: status.tone,
  mapsTo: status.id,
  custom: false,
}));

/** Badge colours a custom column can take, named for the picker. */
export const COLUMN_TONES: ReadonlyArray<{ readonly id: SemanticTone; readonly label: string }> = [
  { id: 'todo', label: 'خاکستری' },
  { id: 'progress', label: 'کهربایی' },
  { id: 'review', label: 'بنفش' },
  { id: 'done', label: 'سبز' },
  { id: 'blocked', label: 'قرمز' },
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

/* ------------------------------ Chat filters ------------------------------ */

export const CHAT_FILTERS: ReadonlyArray<{ readonly id: ChatFilterId; readonly label: string }> = [
  { id: 'all', label: 'همه' },
  { id: 'direct', label: 'شخصی' },
  { id: 'groups', label: 'گروه‌ها' },
  { id: 'unread', label: 'خوانده‌نشده' },
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

const ALL_ACTIONS: readonly PermissionActionId[] = PERMISSION_ACTIONS.map((action) => action.id);

const grant = (...actions: readonly PermissionActionId[]) =>
  Object.fromEntries(ALL_ACTIONS.map((action) => [action, actions.includes(action)])) as Readonly<
    Record<PermissionActionId, boolean>
  >;

const ALL = grant(...ALL_ACTIONS);
const NONE = grant();

/** Shipping defaults. The RBAC screen edits a working copy of this and can reset back to it. */
export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  owner: { messages: ALL, boards: ALL, files: ALL, reports: ALL, members: ALL },
  admin: {
    messages: ALL,
    boards: ALL,
    files: ALL,
    reports: ALL,
    members: grant('view', 'create', 'edit', 'assign'),
  },
  manager: {
    messages: grant('view', 'create', 'edit', 'assign'),
    boards: ALL,
    files: grant('view', 'create', 'edit', 'delete'),
    reports: grant('view', 'create', 'edit'),
    members: grant('view', 'assign'),
  },
  member: {
    messages: grant('view', 'create', 'edit'),
    boards: grant('view', 'create', 'edit', 'assign'),
    files: grant('view', 'create'),
    reports: grant('view', 'create'),
    members: grant('view'),
  },
  guest: {
    messages: grant('view'),
    boards: grant('view'),
    files: grant('view'),
    reports: NONE,
    members: NONE,
  },
};

export const roleLabel = (role: RoleId): string =>
  ROLES.find((entry) => entry.id === role)?.name ?? role;
