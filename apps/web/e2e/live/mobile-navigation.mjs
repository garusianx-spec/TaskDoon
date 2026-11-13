import { check, eventually, visible } from '../lib/harness.mjs';

const mobile = { width: 390, height: 844 };
const nav = (page) => page.getByRole('navigation', { name: 'ناوبری پایین' });
const main = (page) => page.getByRole('main');
const inviteDialog = (page) => page.getByRole('dialog', { name: 'دعوت همکار' });
const pending = (page) => main(page).getByRole('region', { name: 'دعوت‌های در انتظار پذیرش' });
const inviteFromQuickCreate = async (page) => {
  await page.getByRole('button', { name: 'ایجاد سریع', exact: true }).click();
  return page.getByRole('menuitem', { name: 'دعوت همکار', exact: true });
};

async function goToMembers(page) {
  await nav(page).getByRole('link', { name: 'بیشتر' }).click();
  await main(page).getByRole('link', { name: 'اعضا' }).click();
  await page.waitForURL('**/directory');
}

export async function verifyMobileNavigation(
  owner,
  member,
  { base, projectName, taskTitle, managerPhone, pendingPhone, readInvitation, signInManager, manager },
) {
  const desktop = owner.viewportSize();
  const memberViewport = member.viewportSize();
  await owner.setViewportSize(mobile);
  await member.setViewportSize(mobile);
  try {
    for (const page of [owner, member]) {
      await nav(page).getByRole('link', { name: 'پروژه‌ها' }).click();
      await main(page).getByRole('link', { name: projectName, exact: true }).click();
      await page.waitForURL(/\/projects\/[^/]+$/);
      check(
        (await visible(main(page).getByRole('heading', { name: projectName }))) &&
          (await visible(main(page).getByRole('application', { name: 'بورد کانبان وظایف' }))),
        `live mobile: the ${page === owner ? 'owner' : 'member'} opens the project board`,
      );
      await nav(page).getByRole('link', { name: 'کارهای من' }).click();
      await page.waitForURL('**/tasks/mine');
    }
    check(
      (await visible(
        main(member)
          .getByRole('button', { name: new RegExp(taskTitle) })
          .first(),
      )) && (await main(owner).getByText(taskTitle, { exact: true }).count()) === 0,
      'live mobile: the task appears only in the assignee’s personal list',
    );

    await goToMembers(owner);
    const invite = inviteDialog(owner);
    await main(owner).getByRole('button', { name: 'دعوت همکار', exact: true }).click();
    const recipient = invite.getByLabel('ایمیل یا شماره موبایل همکاران');
    await recipient.fill(managerPhone);
    await recipient.press('Enter');
    await invite.getByRole('combobox', { name: 'نقش', exact: true }).click();
    await owner.getByRole('option', { name: /^مدیر سیستم/ }).click();
    const invitation = await readInvitation(() =>
      invite.getByRole('button', { name: 'ارسال دعوت‌نامه' }).click(),
    );
    await invite.waitFor({ state: 'hidden' });
    const link = new URL(invitation);
    await manager.goto(`${base}${link.pathname}${link.search}`);
    await signInManager(manager);
    await manager.waitForURL('**/feed', { timeout: 20_000 });
    await visible(nav(manager), 20_000);

    const shortcut = await inviteFromQuickCreate(owner);
    await shortcut.click();
    await recipient.fill(pendingPhone);
    await recipient.press('Enter');
    await readInvitation(() => invite.getByRole('button', { name: 'ارسال دعوت‌نامه' }).click());
    check(
      await visible(
        pending(owner)
          .getByRole('button', { name: /^لغو دعوت/ })
          .first(),
      ),
      'live mobile: Quick Create uses the shared invite form and the owner can revoke a pending invite',
    );

    await member.reload();
    await goToMembers(member);
    check(
      (await visible(pending(member).getByRole('listitem').first())) &&
        (await main(member).getByRole('button', { name: 'دعوت همکار', exact: true }).count()) === 0 &&
        (await pending(member)
          .getByRole('button', { name: /^لغو دعوت/ })
          .count()) === 0,
      'live mobile: a regular member can view pending invitations with read permission',
    );
    check(
      (await (await inviteFromQuickCreate(member)).count()) === 0,
      'live mobile: Quick Create follows the member’s invitation permission',
    );
    await member.keyboard.press('Escape');

    await manager.reload();
    await goToMembers(manager);
    check(
      await visible(pending(manager).getByRole('listitem').first()),
      'live mobile: the workspace admin sees pending invitations',
    );
    await main(manager).getByRole('button', { name: 'دعوت همکار', exact: true }).click();
    const managerInvite = inviteDialog(manager);
    check(
      (await visible(managerInvite.getByLabel('ایمیل یا شماره موبایل همکاران'))) &&
        (await managerInvite.getByRole('button', { name: /^لغو دعوت/ }).count()) === 0,
      'live mobile: the workspace admin can invite with the existing form and needs delete permission to revoke',
    );
    await manager.keyboard.press('Escape');
    await managerInvite.waitFor({ state: 'hidden' });
    await nav(manager).getByRole('link', { name: 'پروژه‌ها' }).click();
    await manager.waitForURL('**/projects');
    check(
      (await main(manager).getByRole('button', { name: 'آرشیو / سطل زباله' }).count()) === 0,
      'live mobile: a workspace admin without ownership has no project trash action',
    );

    await nav(owner).getByRole('link', { name: 'پروژه‌ها' }).click();
    await main(owner).getByRole('button', { name: 'آرشیو / سطل زباله' }).click();
    const trash = owner.getByRole('dialog', { name: 'آرشیو / سطل زباله' });
    check(await visible(trash), 'live mobile: the owner can open project trash');
    await owner.keyboard.press('Escape');
    await eventually(async () => (await trash.count()) === 0);
  } finally {
    await owner.setViewportSize(desktop);
    await member.setViewportSize(memberViewport);
  }
}
