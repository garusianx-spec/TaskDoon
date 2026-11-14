import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays,
  buildCalendarGrid,
  formatCalendarDate,
  shiftCalendarMonth,
  toISODate,
} from '../dist/index.js';

test('both systems keep the same civil date and weekday around Nowruz', () => {
  const iso = '2025-03-21';
  for (const [system, year, month, day] of [
    ['jalali', 1404, 1, 1],
    ['gregorian', 2025, 3, 21],
  ]) {
    const cells = buildCalendarGrid(system, iso, iso);
    assert.equal(cells.length, 42);
    assert.equal(cells[0].weekdayIndex, 0);
    assert.equal(cells.filter((cell) => cell.isToday).length, 1);
    assert.deepEqual(
      cells.find((cell) => cell.iso === iso),
      {
        iso,
        day: { year, month, day },
        weekdayIndex: 6,
        inCurrentMonth: true,
        isToday: true,
      },
    );
    assert.ok(cells.slice(1).every((cell, index) => cell.iso === addDays(cells[index].iso, 1)));
  }

  assert.equal(formatCalendarDate('jalali', iso, 'month-year'), 'فروردین ۱۴۰۴');
  assert.equal(formatCalendarDate('gregorian', iso, 'long'), 'Friday, March 21, 2025');
});

test('leap days and shorter months clamp in the active calendar', () => {
  assert.equal(shiftCalendarMonth('gregorian', '2024-01-31', 1), '2024-02-29');
  assert.equal(shiftCalendarMonth('gregorian', '2025-03-31', -1), '2025-02-28');
  assert.equal(shiftCalendarMonth('gregorian', '2025-12-31', 1), '2026-01-31');
  assert.equal(shiftCalendarMonth('jalali', '2025-02-18', 1), '2025-03-20');
  assert.equal(shiftCalendarMonth('jalali', '2026-02-18', 1), '2026-03-20');
  assert.equal(shiftCalendarMonth('jalali', '2025-03-20', 1), '2025-04-19');
});

test('only the clock is projected onto Tehran time at local midnight', () => {
  const before = new Date('2025-03-20T20:29:59Z');
  const after = new Date('2025-03-20T20:30:00Z');
  assert.equal(toISODate(before, 'Asia/Tehran'), '2025-03-20');
  assert.equal(toISODate(after, 'Asia/Tehran'), '2025-03-21');
  assert.equal(toISODate(after, 'America/Los_Angeles'), '2025-03-20');

  for (const system of ['jalali', 'gregorian']) {
    const grid = buildCalendarGrid(system, '2025-03-20', toISODate(after, 'Asia/Tehran'));
    assert.equal(grid.find((cell) => cell.isToday)?.iso, '2025-03-21');
    assert.equal(grid.find((cell) => cell.iso === '2025-03-20')?.isToday, false);
  }
});
