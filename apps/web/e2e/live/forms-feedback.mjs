import { check, eventually, out, visible } from '../lib/harness.mjs';

/** Exercise the real API while simulating a lost response after the first calendar write commits. */
export async function verifyFormFeedback(page, base, runId) {
  const title = `بازبینی پاسخ فرم ${runId}`;
  const description = 'این متن باید هنگام تلاش دوباره در فرم بماند.';
  const success = `رویداد «${title}» در تقویم ثبت شد.`;
  const responseStarted = Promise.withResolvers();
  const release = Promise.withResolvers();
  const requests = [];
  let committedStatus;
  const path = /\/api\/v1\/workspaces\/[^/]+\/calendar\/events$/;
  const loseResponse = async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    requests.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
    if (requests.length > 1) return route.continue();
    responseStarted.resolve();
    await release.promise;
    const committed = await route.fetch();
    committedStatus = committed.status();
    // A broken body exercises the UI recovery path without creating a browser console warning.
    await route.fulfill({ status: committedStatus, contentType: 'application/json', body: '{' });
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/calendar`);
  const dialog = page.getByRole('dialog', { name: 'رویداد تقویم' });
  const toast = page.getByRole('status').filter({ hasText: success });
  const submit = dialog.getByRole('button', { name: 'ثبت در تقویم' });
  await page.getByRole('button', { name: 'رویداد جدید', exact: true }).first().click();
  await dialog.getByRole('textbox', { name: 'عنوان', exact: true }).fill(title);
  await dialog.getByRole('textbox', { name: 'توضیحات (اختیاری)' }).fill(description);
  await page.route(path, loseResponse);
  try {
    await submit.evaluate((button) => {
      button.click();
      button.click();
    });
    await Promise.race([
      responseStarted.promise,
      dialog.getByRole('button', { name: 'در حال ثبت…' }).waitFor(),
    ]);
    check(
      await visible(dialog.getByRole('button', { name: 'در حال ثبت…' })),
      'calendar form shows its pending state',
    );
    check((await toast.count()) === 0, 'calendar form announces no success before the response');
    release.resolve();
    check(
      await visible(dialog.getByRole('alert').filter({ hasText: 'رویداد ثبت نشد. دوباره تلاش کنید.' })),
      'a lost calendar response shows a retryable form error',
    );
    check(
      committedStatus === 201 && requests.length === 1,
      'a rapid double tap commits one calendar request',
    );
    check(
      (await dialog.getByRole('textbox', { name: 'عنوان', exact: true }).inputValue()) === title,
      'calendar failure preserves the title',
    );
    check(
      (await dialog.getByRole('textbox', { name: 'توضیحات (اختیاری)' }).inputValue()) === description,
      'calendar failure preserves the description',
    );
    check((await toast.count()) === 0, 'the failed calendar response does not announce success');
    await page.screenshot({ path: `${out}/phase2-calendar-retry-390.png`, animations: 'disabled' });
    const footer = await dialog.locator('footer').boundingBox();

    await submit.click();
    await dialog.waitFor({ state: 'hidden' });
    check(
      requests.length === 2 &&
        Boolean(requests[0].key) &&
        requests[0].key === requests[1].key &&
        JSON.stringify(requests[0].body) === JSON.stringify(requests[1].body),
      'calendar retry sends the same payload and idempotency key',
    );
    check(await visible(toast), 'calendar success has a visible confirmation after the retry');
    check(
      (await page.getByText(success, { exact: true }).count()) === 1,
      'calendar success is rendered in one announcement',
    );
    const notice = await toast.boundingBox();
    check(
      Boolean(notice && footer && notice.y + notice.height < footer.y),
      '390px: the toast sits above the form actions and bottom navigation',
    );
    await page.screenshot({ path: `${out}/phase2-calendar-confirmed-390.png`, animations: 'disabled' });

    const data = page.waitForResponse(
      (response) =>
        /^\/api\/v1\/workspaces\/[^/]+\/calendar$/.test(new URL(response.url()).pathname) &&
        response.request().method() === 'GET' &&
        response.ok(),
    );
    await page.reload();
    const calendar = await (await data).json();
    check(
      calendar.events.filter((event) => event.title === title).length === 1,
      'the reloaded calendar has exactly one event after the retry',
    );
    check(
      await eventually(() =>
        page.locator('html').evaluate((root) => root.dir === 'rtl' && root.scrollWidth <= root.clientWidth),
      ),
      '390px: the calendar remains RTL without page overflow',
    );
  } finally {
    release.resolve();
    await page.unroute(path, loseResponse);
  }
}
