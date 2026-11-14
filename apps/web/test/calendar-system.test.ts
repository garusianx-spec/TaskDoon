import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCalendarGrid, type CalendarSystem } from '@taskin/jalali';
import { CalendarSystemToggle } from '@/features/calendar/components/CalendarSystemToggle';
import { calendarKeyboardDate } from '@/features/calendar/hooks/useCalendarGrid';
import { useCalendarPreference } from '@/features/calendar/hooks/useCalendarPreference';
import { calendarItemsByDate } from '@/store/selectors';
import { TASKS } from '@/data/workspace';

afterEach(() => vi.unstubAllGlobals());

function PreferenceProbe() {
  const { system, setCalendarSystem } = useCalendarPreference();
  return createElement(CalendarSystemToggle, { system, onChange: setCalendarSystem });
}

describe('calendar display preference', () => {
  it('renders the same hydration markup with and without a stored Gregorian preference', () => {
    const server = renderToString(createElement(PreferenceProbe));
    const getItem = vi.fn(() => 'gregorian');
    vi.stubGlobal('window', { localStorage: { getItem } });

    expect(renderToString(createElement(PreferenceProbe))).toBe(server);
    expect(getItem).not.toHaveBeenCalled();
    expect(server).toMatch(/aria-pressed="true"[^>]*>شمسی/);
  });

  it('keeps a deadline on the same selected day through both calendar grids', () => {
    const iso = '2025-03-21';
    const [seed] = TASKS;
    if (!seed) throw new Error('Expected a demo task');
    const task = { ...seed, id: 'example', dueDate: iso };
    const items = calendarItemsByDate([task], []);
    const modes: CalendarSystem[] = ['jalali', 'gregorian', 'jalali'];

    for (const system of modes) {
      const selected = buildCalendarGrid(system, iso, iso).find((cell) => cell.iso === iso);
      expect(selected?.inCurrentMonth).toBe(true);
      expect(items.get(selected?.iso ?? '')?.[0]?.id).toBe('deadline-example');
    }
  });

  it.each([
    ['gregorian', '2024-01-31', '2024-02-29'],
    ['jalali', '2025-03-20', '2025-04-19'],
  ] as const)('pages through a %s month and follows RTL day navigation', (system, date, nextMonth) => {
    const cell = buildCalendarGrid(system, date, date).find((entry) => entry.isToday);
    if (!cell) throw new Error('Calendar grid must include today');
    expect(calendarKeyboardDate(system, cell, 'PageDown')).toBe(nextMonth);
    expect(calendarKeyboardDate(system, cell, 'ArrowLeft')).toBe(
      system === 'jalali' ? '2025-03-21' : '2024-02-01',
    );
  });
});
