const ROUTES = {
  today: '/feed',
  myTasks: '/my-tasks',
  projects: '/projects',
  chats: '/chats',
  more: '/more',
  account: '/more/account',
  appearance: '/more/account/appearance',
  workspaceSettings: '/more/workspace',
} as const;

export const workspaceRoutes = ROUTES;

export function projectHref(projectId: string): string {
  return `${ROUTES.projects}/${encodeURIComponent(projectId)}`;
}

export function isRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function mobileTabFor(pathname: string): string | undefined {
  if (isRoute(pathname, ROUTES.today)) return ROUTES.today;
  if (isRoute(pathname, ROUTES.myTasks)) return ROUTES.myTasks;
  if (isRoute(pathname, ROUTES.projects) || isRoute(pathname, '/tasks')) return ROUTES.projects;
  if (isRoute(pathname, ROUTES.chats)) return ROUTES.chats;
  return ['/more', '/calendar', '/notes', '/directory', '/settings'].some((href) => isRoute(pathname, href))
    ? ROUTES.more
    : undefined;
}

export function mobilePageTitle(pathname: string): string | undefined {
  if (isRoute(pathname, ROUTES.appearance)) return 'ظاهر شخصی';
  if (isRoute(pathname, ROUTES.account)) return 'حساب من';
  if (isRoute(pathname, ROUTES.workspaceSettings)) return 'تنظیمات فضای کاری';
  if (isRoute(pathname, '/settings/roles')) return 'نقش‌ها و سطوح دسترسی';
  if (isRoute(pathname, '/calendar')) return 'تقویم';
  if (isRoute(pathname, '/notes')) return 'یادداشت‌ها';
  if (isRoute(pathname, '/directory')) return 'اعضا';
  switch (mobileTabFor(pathname)) {
    case ROUTES.today:
      return 'امروز';
    case ROUTES.myTasks:
      return 'کارهای من';
    case ROUTES.projects:
      return 'پروژه‌ها';
    case ROUTES.chats:
      return 'گفت‌وگوها';
    case ROUTES.more:
      return 'بیشتر';
  }
}
