import { check, eventually, out, visible } from '../lib/harness.mjs';

/** Real API checks; restores the account name so the surrounding two-person flow keeps its fixtures. */
export async function verifyProfileNavNotes(page, { runId }) {
  const rail = page.getByRole('navigation', { name: 'ناوبری اصلی' });
  const openProfile = async () => {
    await rail.getByRole('button', { name: /حساب کاربری/ }).click();
    await page.getByRole('menuitem', { name: 'پروفایل من', exact: true }).click();
    await page.getByRole('dialog', { name: 'پروفایل من' }).waitFor();
  };
  check(await visible(rail.getByRole('heading', { name: 'منو', exact: true })), 'live desktop navigation exposes its section title');
  await openProfile();
  const profile = page.getByRole('dialog', { name: 'پروفایل من' });
  const name = profile.getByRole('textbox', { name: 'نام نمایشی' });
  const originalName = await name.inputValue();
  const editedName = `نام آزمون ${runId}`;
  let releaseName;
  const nameGate = new Promise(resolve => { releaseName = resolve; });
  let nameRequest;
  const holdName = async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    nameRequest = route.request().postDataJSON();
    await nameGate;
    await route.continue();
  };
  await page.route('**/api/v1/me', holdName);
  try {
    await name.fill(editedName);
    await profile.getByRole('button', { name: 'ذخیره تغییرات' }).click();
    check(await eventually(async () => Boolean(nameRequest) && await profile.getByRole('button', { name: 'در حال ذخیره…' }).getAttribute('aria-busy') === 'true'), 'live profile Save exposes pending feedback until the API confirms');
    check(await name.isDisabled() && await name.inputValue() === editedName, 'pending profile save preserves and locks the entered name');
  } finally {
    releaseName();
  }
  check(await eventually(async () => await profile.count() === 0, 15000), 'live profile closes after confirmed persistence');
  await page.unroute('**/api/v1/me', holdName);
  check(nameRequest?.fullName === editedName && Object.keys(nameRequest).length === 1, 'the profile request changes only the signed-in account name');
  check(await eventually(async () => (await rail.getByRole('button', { name: /حساب کاربری/ }).textContent()).includes(editedName)), 'the live shared header immediately reflects the confirmed name');
  await page.reload();
  await rail.waitFor({ timeout: 30000 });
  await openProfile();
  check(await name.inputValue() === editedName, 'the profile name survives a full server reload');
  await name.fill(originalName);
  await profile.getByRole('button', { name: 'ذخیره تغییرات' }).click();
  await profile.waitFor({ state: 'hidden' });

  await rail.getByRole('link', { name: 'یادداشت‌ها' }).click();
  await page.waitForURL('**/notes');
  const editor = page.getByRole('article');
  await page.getByRole('complementary', { name: 'ستون زمینه' }).getByRole('button', { name: 'یادداشت جدید', exact: true }).click();
  await editor.getByRole('combobox', { name: 'دسته', exact: true }).click();
  await page.getByRole('option', { name: 'ایده‌ها', exact: true }).click();
  let releaseCreate;
  const createGate = new Promise(resolve => { releaseCreate = resolve; });
  const creates = [];
  const holdCreate = async route => {
    if (route.request().method() !== 'POST') return route.continue();
    creates.push(route.request().postDataJSON());
    await createGate;
    await route.continue();
  };
  await page.route('**/api/v1/workspaces/*/notes', holdCreate);
  const title = `یادداشت مرحله سوم ${runId}`;
  const body = 'متن واقعی پس از ذخیره باقی می‌ماند';
  try {
    await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).fill(title);
    check(await eventually(() => creates.length === 1), 'the categorized draft starts exactly one live create');
    await editor.getByRole('combobox', { name: 'دسته', exact: true }).click();
    await page.getByRole('option', { name: 'کاری', exact: true }).click();
    await editor.getByRole('textbox', { name: 'متن یادداشت', exact: true }).fill(body);
    await editor.getByRole('button', { name: 'ذخیره یادداشت', exact: true }).click();
    check(await eventually(async () => await editor.getAttribute('aria-busy') === 'true'), 'explicit Save waits for the pending create before resetting');
    check(await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).inputValue() === title && await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).isDisabled(), 'pending note Save keeps the full draft visible and locked');
  } finally {
    releaseCreate();
  }
  check(await eventually(async () => await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).inputValue() === '' && await editor.getByRole('textbox', { name: 'متن یادداشت', exact: true }).inputValue() === '', 15000), 'confirmed live Save clears title and body into a new draft');
  await page.unroute('**/api/v1/workspaces/*/notes', holdCreate);
  check(creates.length === 1 && /^[0-9a-f-]{36}$/.test(creates[0]?.categoryId), 'creation sends a canonical category UUID without duplicate note posts');
  check(await editor.getByRole('combobox', { name: 'دسته', exact: true }).textContent() === 'کاری', 'the fresh live draft retains the category changed during creation');
  check(await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).evaluate(node => node === document.activeElement), 'the reset live editor focuses its new title');
  const [savedNotes] = await Promise.all([
    page.waitForResponse(response => response.request().method() === 'GET' && /^\/api\/v1\/workspaces\/[^/]+\/notes$/.test(new URL(response.url()).pathname)).then(response => response.json()),
    page.reload(),
  ]);
  const persisted = savedNotes.items.filter(note => note.title === title);
  check(persisted.length === 1 && persisted[0].body === body, 'after reload: one fully persisted note and no stored reset draft');
  await page.getByRole('region', { name: 'فهرست همه یادداشت‌ها' }).getByRole('button').filter({ hasText: title }).click();
  check(await editor.getByRole('combobox', { name: 'دسته', exact: true }).textContent() === 'کاری', 'the late category selection is persisted on the real server');
  const customLabel = `دفتر ${runId}`;
  const sidebar = page.getByRole('complementary', { name: 'ستون زمینه' });
  await sidebar.getByRole('button', { name: 'افزودن دسته', exact: true }).click();
  const categoryForm = page.getByRole('dialog', { name: 'دسته جدید', exact: true });
  await categoryForm.getByRole('textbox', { name: 'نام دسته' }).fill(customLabel);
  const categoryResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/note-categories')).then(response => response.json());
  await categoryForm.getByRole('button', { name: 'ایجاد دسته', exact: true }).click();
  const customCategory = await categoryResponse;
  check(await eventually(async () => await sidebar.getByRole('button').filter({ hasText: customLabel }).getAttribute('aria-current') === 'true'), 'a newly stored custom notebook retains the selected sidebar filter');
  await sidebar.getByRole('button', { name: 'یادداشت جدید', exact: true }).click();
  check(await editor.getByRole('combobox', { name: 'دسته', exact: true }).textContent() === customLabel, 'creation inherits a custom notebook after its temporary ID becomes canonical');
  await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).fill(`متن ${customLabel}`);
  await editor.getByRole('textbox', { name: 'متن یادداشت', exact: true }).fill('محتوای دفتر سفارشی');
  const customSave = page.waitForResponse(response => response.request().method() === 'PATCH' && /\/notes\//.test(new URL(response.url()).pathname)).then(response => response.json());
  await editor.getByRole('button', { name: 'ذخیره یادداشت', exact: true }).click();
  const customNote = await customSave;
  check(customNote.categoryId === customCategory.id && customNote.body === 'محتوای دفتر سفارشی', 'the custom notebook ID and note body persist in the confirmed API response');
  check(await eventually(async () => await editor.getByRole('textbox', { name: 'عنوان یادداشت' }).inputValue() === '' && await editor.getByRole('combobox', { name: 'دسته', exact: true }).textContent() === customLabel), 'Save resets the editor while retaining its canonical custom notebook');
  await page.screenshot({ path: `${out}/phase3_live_notes.png` });
  return { note: persisted[0], fullName: originalName };
}
