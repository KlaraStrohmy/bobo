import { describe, expect, it } from 'vitest';
import { cutoffAt, cutoffIso, isCooking, isLocked, type CalendarSettings } from '../src/calendar';

const CS: CalendarSettings = { cookingWeekdays: [2, 4, 5], cutoffDaysBefore: 1, cutoffTime: '16:00' };

describe('pure cooking-day and cutoff logic', () => {
  it('applies the weekday rule', () => {
    expect(isCooking('2026-10-13', CS, null)).toBe(true); // Tue
    expect(isCooking('2026-10-14', CS, null)).toBe(false); // Wed
    expect(isCooking('2026-10-15', CS, null)).toBe(true); // Thu
    expect(isCooking('2026-10-18', CS, null)).toBe(false); // Sun
  });

  it('lets an override win', () => {
    expect(isCooking('2026-10-13', CS, { date: '2026-10-13', cooking: false, note: null })).toBe(false);
    expect(isCooking('2026-10-14', CS, { date: '2026-10-14', cooking: true, note: null })).toBe(true);
  });

  it('computes cutoff and lock at the boundary', () => {
    expect(cutoffAt('2026-10-13', CS).toISOString()).toBe(new Date('2026-10-12T16:00:00+02:00').toISOString());
    expect(isLocked('2026-10-13', CS, new Date('2026-10-12T15:59:00+02:00'))).toBe(false);
    expect(isLocked('2026-10-13', CS, new Date('2026-10-12T15:59:59.999+02:00'))).toBe(false);
    expect(isLocked('2026-10-13', CS, new Date('2026-10-12T16:00:00+02:00'))).toBe(true);
    const twoDays: CalendarSettings = { cookingWeekdays: [2], cutoffDaysBefore: 2, cutoffTime: '09:30' };
    expect(cutoffAt('2026-10-13', twoDays).toISOString()).toBe(new Date('2026-10-11T09:30:00+02:00').toISOString());
  });

  it('computes cutoffs across DST transitions', () => {
    // Tue 2026-10-27: cutoff Mon 16:00 CET (after the switch).
    expect(cutoffIso('2026-10-27', CS)).toBe('2026-10-26T16:00:00+01:00');
    expect(cutoffAt('2026-10-27', CS).toISOString()).toBe('2026-10-26T15:00:00.000Z');
    // Mon 2026-10-26 with 2 days before: Sat 16:00 CEST (before the switch).
    const twoDays: CalendarSettings = { ...CS, cutoffDaysBefore: 2 };
    expect(cutoffIso('2026-10-26', twoDays)).toBe('2026-10-24T16:00:00+02:00');
    // Tue 2027-03-30: cutoff Mon 16:00 CEST; Sun 2027-03-28 cutoff Sat 16:00 CET.
    expect(cutoffIso('2027-03-30', CS)).toBe('2027-03-29T16:00:00+02:00');
    expect(cutoffAt('2027-03-28', CS).toISOString()).toBe('2027-03-27T15:00:00.000Z');
  });
});
