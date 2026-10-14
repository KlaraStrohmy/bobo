import { describe, expect, it } from 'vitest';
import { addDays, dateRange, isoWeekday, localParts, offsetMinutes, parseDate, parseHhmm, zonedIso, zonedTime } from '../src/tz';

describe('Europe/Prague helpers', () => {
  it('resolves local times to instants around the 2026-10-25 autumn transition', () => {
    expect(zonedTime('2026-10-24', '16:00').instant.toISOString()).toBe('2026-10-24T14:00:00.000Z');
    expect(zonedTime('2026-10-25', '16:00').instant.toISOString()).toBe('2026-10-25T15:00:00.000Z');
    expect(zonedTime('2026-10-25', '01:30').instant.toISOString()).toBe('2026-10-24T23:30:00.000Z');
    // 02:30 happens twice; like Python fold=0 the first (CEST) occurrence wins.
    expect(zonedTime('2026-10-25', '02:30').instant.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(zonedIso('2026-10-25', '02:30')).toBe('2026-10-25T02:30:00+02:00');
    expect(zonedTime('2026-10-25', '03:00').instant.toISOString()).toBe('2026-10-25T02:00:00.000Z');
  });

  it('resolves local times around the 2027-03-28 spring transition', () => {
    expect(zonedTime('2027-03-27', '16:00').instant.toISOString()).toBe('2027-03-27T15:00:00.000Z');
    expect(zonedTime('2027-03-28', '16:00').instant.toISOString()).toBe('2027-03-28T14:00:00.000Z');
    expect(zonedTime('2027-03-28', '01:59').instant.toISOString()).toBe('2027-03-28T00:59:00.000Z');
    expect(zonedTime('2027-03-28', '03:00').instant.toISOString()).toBe('2027-03-28T01:00:00.000Z');
    // 02:30 does not exist; like Python fold=0 the pre-transition offset (+01:00) is used.
    expect(zonedTime('2027-03-28', '02:30').instant.toISOString()).toBe('2027-03-28T01:30:00.000Z');
    expect(zonedIso('2027-03-28', '02:30')).toBe('2027-03-28T02:30:00+01:00');
  });

  it('formats local wall time and offsets of instants', () => {
    expect(localParts(new Date('2026-10-12T13:00:00Z'))).toMatchObject({ date: '2026-10-12', time: '15:00' });
    expect(localParts(new Date('2026-10-12T22:30:00Z'))).toMatchObject({ date: '2026-10-13', time: '00:30' });
    expect(localParts(new Date('2026-10-25T00:30:00Z')).time).toBe('02:30');
    expect(localParts(new Date('2026-10-25T01:30:00Z')).time).toBe('02:30');
    expect(localParts(new Date('2027-03-28T00:59:00Z')).time).toBe('01:59');
    expect(localParts(new Date('2027-03-28T01:00:00Z')).time).toBe('03:00');
    expect(offsetMinutes(new Date('2026-10-25T00:59:59Z'))).toBe(120);
    expect(offsetMinutes(new Date('2026-10-25T01:00:00Z'))).toBe(60);
    expect(offsetMinutes(new Date('2027-03-28T00:59:59Z'))).toBe(60);
    expect(offsetMinutes(new Date('2027-03-28T01:00:00Z'))).toBe(120);
    expect(zonedIso('2026-10-14', '16:00')).toBe('2026-10-14T16:00:00+02:00');
    expect(zonedIso('2026-12-14', '16:00')).toBe('2026-12-14T16:00:00+01:00');
  });

  it('does date arithmetic on YYYY-MM-DD strings', () => {
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
    expect(dateRange('2026-10-24', '2026-10-27')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
    expect(parseDate('2026-02-29')).toBeNull();
    expect(parseDate('2028-02-29')).toBe('2028-02-29');
    expect(parseDate('2026-1-01')).toBeNull();
    expect(parseHhmm('25:99')).toBeNull();
    expect(parseHhmm('9:30')).toBeNull();
    expect(parseHhmm('09:30')).toBe('09:30');
  });
});
