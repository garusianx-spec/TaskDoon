import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays,
  formatJalali,
  fromISODate,
  gregorianToJalali,
  isJalaliLeapYear,
  jalaliMonthLength,
  jalaliToGregorian,
  shiftJalaliMonth,
  toISODate,
  toPersianDigits,
} from '../dist/index.js';

/** ICU's Persian calendar, used only as an oracle here — never at runtime. */
const persian = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
const icuJalali = (date) => {
  const parts = Object.fromEntries(persian.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number.parseInt(parts.year, 10), month: Number(parts.month), day: Number(parts.day) };
};

test('matches ICU for every day from 1990 through 2035 and round-trips', () => {
  // Noon avoids any DST-midnight edge in the host time zone.
  const cursor = new Date(1990, 0, 1, 12);
  const end = new Date(2035, 11, 31, 12);
  let days = 0;
  while (cursor <= end) {
    const ours = gregorianToJalali(cursor);
    assert.deepEqual(ours, icuJalali(cursor), `mismatch on ${toISODate(cursor)}`);
    assert.equal(toISODate(jalaliToGregorian(ours.year, ours.month, ours.day)), toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    days += 1;
  }
  assert.equal(days, 16_801);
});

test('leap years give Esfand 30 days', () => {
  assert.equal(isJalaliLeapYear(1403), true);
  assert.equal(jalaliMonthLength(1403, 12), 30);
  assert.equal(isJalaliLeapYear(1404), false);
  assert.equal(jalaliMonthLength(1404, 12), 29);
  assert.equal(jalaliMonthLength(1404, 6), 31);
  assert.equal(jalaliMonthLength(1404, 7), 30);
});

test('Nowruz 1405 falls on 2026-03-21', () => {
  assert.deepEqual(gregorianToJalali(fromISODate('2026-03-21')), { year: 1405, month: 1, day: 1 });
  assert.equal(formatJalali(fromISODate('2026-03-21'), 'medium'), '۱ فروردین ۱۴۰۵');
  assert.equal(formatJalali(fromISODate('2026-03-21'), 'short'), '۱۴۰۵/۰۱/۰۱');
});

test('local-date helpers never shift a day', () => {
  assert.equal(toISODate(fromISODate('2026-03-20')), '2026-03-20');
  assert.equal(addDays('2026-03-20', 1), '2026-03-21');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('month stepping rolls the year over', () => {
  assert.deepEqual(shiftJalaliMonth(1404, 12, 1), { year: 1405, month: 1, day: 1 });
  assert.deepEqual(shiftJalaliMonth(1405, 1, -1), { year: 1404, month: 12, day: 1 });
});

test('Persian digits', () => {
  assert.equal(toPersianDigits('2026-03-21'), '۲۰۲۶-۰۳-۲۱');
  assert.equal(toPersianDigits(1405), '۱۴۰۵');
});
