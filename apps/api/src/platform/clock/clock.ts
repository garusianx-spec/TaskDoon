import { Injectable } from '@nestjs/common';

/**
 * The current time, for everything that depends on "today": due-soon, default start dates,
 * calendar ranges, reminders. Tests pin it (`clock.pin(date)`) to check what "today" means at
 * 00:30 in Tehran; production never pins it.
 */
@Injectable()
export class Clock {
  private pinned: Date | null = null;

  now(): Date {
    return this.pinned ? new Date(this.pinned) : new Date();
  }

  /** Test support: freeze the clock at `date`, or release it with `null`. */
  pin(date: Date | null): void {
    this.pinned = date ? new Date(date) : null;
  }
}

/** `YYYY-MM-DD` of `instant` on the wall calendar of `timeZone` (an IANA zone). */
export function dateIn(timeZone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Adds whole days to a `YYYY-MM-DD` date (calendar arithmetic, no time zone involved). */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** The UTC instant of wall-clock `isoDate` `time` (`HH:mm`) in `timeZone`. */
export function instantIn(timeZone: string, isoDate: string, time: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // The zone's offset at that moment: format the guess in the zone and compare wall clocks.
  const offset = (at: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(new Date(at));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
    return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute')) - at;
  };
  const first = guess - offset(guess);
  // A second pass settles instants near an offset change.
  return new Date(guess - offset(first));
}

/** `HH:mm` of `instant` in `timeZone`. */
export function timeIn(timeZone: string, instant: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
}
