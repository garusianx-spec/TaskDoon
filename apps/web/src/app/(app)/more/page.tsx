import { AppShell } from '@/components/layout/AppShell';
import { NavigationList, NavigationRow } from '@/components/layout/NavigationList';
import {
  CalendarIcon,
  MessagesIcon,
  NotebookIcon,
  PeopleIcon,
  SettingsIcon,
  UserIcon,
} from '@/components/icons';
import { workspaceRoutes } from '@/lib/workspace-navigation';

export default function MorePage() {
  return (
    <AppShell>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
          <h1 className="text-heading font-bold text-fg-primary">بیشتر</h1>
          <nav aria-label="تنظیمات بیشتر" className="flex flex-col gap-5">
            <NavigationList id="more-workspace" title="فضای کاری">
              <NavigationRow href="/calendar" label="تقویم" Icon={CalendarIcon} />
              <NavigationRow href="/notes" label="یادداشت‌ها" Icon={NotebookIcon} />
              <NavigationRow href="/directory" label="اعضا" Icon={PeopleIcon} />
            </NavigationList>
            <NavigationList id="more-settings" title="تنظیمات">
              <NavigationRow href="/support/tickets" label="درخواست‌های پشتیبانی" Icon={MessagesIcon} />
              <NavigationRow href={workspaceRoutes.account} label="حساب من" Icon={UserIcon} />
              <NavigationRow
                href={workspaceRoutes.workspaceSettings}
                label="تنظیمات فضای کاری"
                Icon={SettingsIcon}
              />
            </NavigationList>
          </nav>
        </div>
      </div>
    </AppShell>
  );
}
