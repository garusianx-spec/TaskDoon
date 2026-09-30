import { describe, expect, it } from 'vitest';
import { isWorkingTime, weekDayOf } from '../../src/modules/chat/working-hours.js';

/** An instant given as Tehran wall-clock time (UTC+03:30; Iran keeps no daylight saving). */
const tehran = (isoDate: string, time: string) => new Date(`${isoDate}T${time}:00+03:30`);
const office = { days: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday'] as const, start: '09:00', end: '18:00' };

describe('Phase 3.2: working hours', () => {
  it('names the weekday of a calendar date', () => {
    expect(weekDayOf('2026-10-03')).toBe('saturday');
    expect(weekDayOf('2026-10-02')).toBe('friday');
  });

  it('is working time from the start (inclusive) to the end (exclusive) on working days', () => {
    expect(isWorkingTime(office, 'Asia/Tehran', tehran('2026-10-03', '09:00'))).toBe(true);
    expect(isWorkingTime(office, 'Asia/Tehran', tehran('2026-10-03', '17:59'))).toBe(true);
    expect(isWorkingTime(office, 'Asia/Tehran', tehran('2026-10-03', '18:00'))).toBe(false);
    expect(isWorkingTime(office, 'Asia/Tehran', tehran('2026-10-03', '08:59'))).toBe(false);
  });

  it('is never working time on a day off, and always away with no working days', () => {
    expect(isWorkingTime(office, 'Asia/Tehran', tehran('2026-10-02', '12:00'))).toBe(false);
    expect(isWorkingTime({ ...office, days: [] }, 'Asia/Tehran', tehran('2026-10-03', '12:00'))).toBe(false);
  });

  it('reads the hours on the workspace’s wall clock, not the server’s', () => {
    // 06:00 UTC is 09:30 in Tehran (working) but 06:00 in London time zones (not).
    const at = new Date('2026-10-03T06:00:00Z');
    expect(isWorkingTime(office, 'Asia/Tehran', at)).toBe(true);
    expect(isWorkingTime(office, 'UTC', at)).toBe(false);
  });

  it('gives a shift past midnight to the day it starts on', () => {
    const night = { days: ['saturday'] as const, start: '22:00', end: '06:00' };
    expect(isWorkingTime(night, 'Asia/Tehran', tehran('2026-10-03', '23:00'))).toBe(true);
    // Sunday 02:00 belongs to Saturday's shift …
    expect(isWorkingTime(night, 'Asia/Tehran', tehran('2026-10-04', '02:00'))).toBe(true);
    // … Saturday 02:00 to Friday's, which is not a working day.
    expect(isWorkingTime(night, 'Asia/Tehran', tehran('2026-10-03', '02:00'))).toBe(false);
    expect(isWorkingTime(night, 'Asia/Tehran', tehran('2026-10-04', '06:00'))).toBe(false);
    expect(isWorkingTime(night, 'Asia/Tehran', tehran('2026-10-03', '12:00'))).toBe(false);
  });
});
