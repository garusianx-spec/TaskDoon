import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromISODate, gregorianToJalali, toISODate } from '../dist/index.js';

test('workspace today follows Tehran at the UTC instant that failed live task creation', () => {
  const instant = new Date('2026-10-08T22:20:35.000Z');
  assert.equal(toISODate(instant, 'UTC'), '2026-10-08');
  assert.equal(toISODate(instant, 'Asia/Tehran'), '2026-10-09');
});

test('the workspace calendar changes at its own midnight', () => {
  assert.equal(toISODate(new Date('2026-10-08T20:29:59.999Z'), 'Asia/Tehran'), '2026-10-08');
  assert.equal(toISODate(new Date('2026-10-08T20:30:00.000Z'), 'Asia/Tehran'), '2026-10-09');
});

test('custom workspace zones can have different days, including year and leap-day boundaries', () => {
  const cases = [
    ['2026-10-08T10:30:00.000Z', 'Pacific/Kiritimati', '2026-10-09'],
    ['2026-10-09T02:00:00.000Z', 'America/New_York', '2026-10-08'],
    ['2026-10-09T02:00:00.000Z', 'Asia/Tehran', '2026-10-09'],
    ['2026-12-31T21:00:00.000Z', 'Asia/Tehran', '2027-01-01'],
    ['2028-02-29T23:30:00.000Z', 'Asia/Tehran', '2028-03-01'],
    ['2028-02-29T23:30:00.000Z', 'America/New_York', '2028-02-29'],
  ];
  for (const [instant, zone, expected] of cases) {
    assert.equal(toISODate(new Date(instant), zone), expected, `${instant} in ${zone}`);
  }
});

test('picker civil dates and device-local callers preserve the chosen calendar day', () => {
  const selected = fromISODate('2026-03-21');
  assert.equal(toISODate(selected), '2026-03-21');
  assert.equal(toISODate(selected, undefined), '2026-03-21');
  assert.deepEqual(gregorianToJalali(selected), { year: 1405, month: 1, day: 1 });
});
