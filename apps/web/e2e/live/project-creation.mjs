/**
 * Additional project-creation checks within live/flow.mjs, after its invited member joined.
 * Reuses the existing second project so the free-plan limit and prior guest-access checks stay
 * meaningful. Every persistence assertion inspects a real API response, including after reload.
 */
import { check, eventually, out, visible } from '../lib/harness.mjs';

const collection = (response, method, resource) => response.request().method() === method
  && new RegExp(`^/api/v1/workspaces/[^/]+/${resource}$`).test(new URL(response.url()).pathname)
  && response.ok();

export async function verifyProjectCreation(page, { projectName, guestName, runId }) {
  await page.getByRole('navigation', { name: 'ناوبری اصلی' }).waitFor();
  // Consume bodies as responses arrive; a reload can invalidate an earlier page's CDP body ID.
  const membersRead = page.waitForResponse((response) => collection(response, 'GET', 'members')).then(response => response.json());
  const departmentsRead = page.waitForResponse((response) => collection(response, 'GET', 'departments')).then(response => response.json());
  await page.reload({ waitUntil: 'networkidle' });
  const members = await membersRead;
  const departments = await departmentsRead;
  const guest = members.find((member) => member.fullName === guestName);
  const product = departments.find((department) => department.name === 'محصول');
  const engineering = departments.find((department) => department.name === 'مهندسی و توسعه');
  if (!guest || !product || !engineering) throw new Error('Live project setup is missing the invited member or default departments.');

  const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });
  await rail.getByRole('button', { name: 'ایجاد سریع' }).click();
  await page.getByRole('menuitem', { name: 'پروژه جدید', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'پروژه جدید', exact: true });
  await dialog.getByRole('textbox', { name: 'نام پروژه', exact: true }).fill(projectName);
  check((await dialog.locator('textarea').count()) === 0, 'live project creation omits the description textarea');
  await dialog.getByRole('button', { name: 'دپارتمان‌های پروژه', exact: true }).click();
  const departmentPicker = page.getByRole('dialog', { name: 'انتخاب دپارتمان‌های پروژه', exact: true });
  await departmentPicker.getByRole('checkbox', { name: engineering.name, exact: true }).click();
  const customName = `پژوهش پروژه ${runId}`;
  await departmentPicker.getByRole('textbox', { name: 'جستجو یا افزودن دپارتمان', exact: true }).fill(customName);
  await departmentPicker.getByRole('button', { name: `افزودن دپارتمان «${customName}»`, exact: true }).click();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'اعضای پروژه', exact: true }).click();
  const memberPicker = page.getByRole('dialog', { name: 'انتخاب اعضای پروژه', exact: true });
  await memberPicker.getByRole('textbox', { name: 'جستجوی اعضای سازمان', exact: true }).fill(guestName);
  await memberPicker.getByRole('checkbox', { name: guestName, exact: true }).click();
  await page.keyboard.press('Escape');
  check(await visible(dialog.getByRole('button', { name: `حذف عضو ${guestName}`, exact: true })), 'the invited workspace member can be selected before project creation');

  const departmentCreated = page.waitForResponse((response) => collection(response, 'POST', 'departments')).then(response => response.json());
  const projectCreated = page.waitForResponse((response) => collection(response, 'POST', 'projects')).then(async response => ({
    submitted: response.request().postDataJSON(), created: await response.json(),
  }));
  await dialog.getByRole('button', { name: 'ایجاد پروژه', exact: true }).click();
  const custom = await departmentCreated;
  const { submitted, created } = await projectCreated;
  check(Boolean(custom.id) && custom.name === customName, 'the custom department is stored through the departments API');
  const expectedDepartments = [product.id, engineering.id, custom.id];
  check(submitted.departmentIds?.length === 3 && expectedDepartments.every((id) => submitted.departmentIds.includes(id)), 'the project payload contains all selected default and custom department IDs');
  check(submitted.memberIds?.includes(guest.userId), 'the project creation payload contains the selected member user ID');
  check(!Object.hasOwn(submitted, 'description'), 'the project payload excludes the removed description field');
  check(created.memberIds?.includes(guest.userId) && new Set(created.memberIds).size === created.memberIds.length, 'the server creates project memberships without duplicates');
  await dialog.waitFor({ state: 'detached' });
  await page.waitForURL('**/tasks');

  const projectsRead = page.waitForResponse((result) => collection(result, 'GET', 'projects')).then(response => response.json());
  const conversationsRead = page.waitForResponse((result) => collection(result, 'GET', 'conversations')).then(response => response.json());
  await page.reload({ waitUntil: 'networkidle' });
  const persisted = (await projectsRead).find((project) => project.id === created.id);
  check(persisted?.departmentIds?.length === 3 && expectedDepartments.every((id) => persisted.departmentIds.includes(id)), 'all selected departments survive a server reload');
  check(persisted?.memberIds?.includes(guest.userId), 'the selected project member survives a server reload');
  const channels = (await conversationsRead).filter((conversation) => conversation.projectId === created.id);
  check(channels.length === 1 && channels[0].membershipMode === 'project_synced', 'the database stores exactly one project-synced companion channel');
  check(channels.length === 1 && channels[0].memberIds.includes(guest.userId), 'the selected member also belongs to the project companion channel');

  const projectEntry = page.getByRole('navigation', { name: 'درخت پروژه‌ها' }).getByRole('button', { name: new RegExp(`^${projectName}`) });
  await projectEntry.click();
  const board = page.getByRole('application', { name: 'بورد کانبان وظایف', exact: true });
  check(await eventually(async () => (await board.getByRole('region', { name: /^ستون / }).count()) === 4), 'the multidepartment project generates the four standard board columns');
  await page.getByRole('button', { name: 'وظیفه جدید', exact: true }).click();
  const taskComposer = page.getByRole('dialog', { name: 'تعریف وظیفه جدید', exact: true });
  await taskComposer.getByRole('textbox', { name: 'عنوان وظیفه', exact: true }).fill(`وظیفه پروژه چندتیمی ${runId}`);
  const taskCreated = page.waitForResponse((result) => collection(result, 'POST', 'tasks')).then(response => response.json());
  await taskComposer.getByRole('button', { name: 'ایجاد وظیفه', exact: true }).click();
  const task = await taskCreated;
  check(task.projectId === created.id && Boolean(task.columnId), 'the generated board accepts a task in its own project and initial column');
  const details = page.getByRole('dialog', { name: 'جزئیات وظیفه', exact: true });
  await details.waitFor();
  await page.keyboard.press('Escape');
  check(await visible(board.getByRole('group', { name: new RegExp(`وظیفه پروژه چندتیمی ${runId}`) })), 'the live project board renders the new task');
  await page.screenshot({ path: `${out}/live_project_creation.png` });
}
