import { describe, expect, it } from 'vitest';
import { buildIcs, type FeedEvent } from '../../../supabase/functions/calendar-feed/index';

const ev = (o: Partial<FeedEvent>): FeedEvent => ({
  id: 'e1', type: 'tree_work', title: 'Dana Smith · Traverse City', status: 'confirmed', all_day: true,
  starts: '2026-11-17', ends: '2026-11-19', address: '12 Pine Rd', town: 'Traverse City', crew: '', equipment: [],
  notes: '', updated_at: '2026-11-16T15:00:00.000Z', job_id: 'j1', job_number: 'E-1001', ...o,
});
const opts = { appUrl: 'https://app.example.com', now: '2026-11-16T12:00:00.000Z' };
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('calendar feed', () => {
  it('makes a work day an all-day event (end day not included, as calendars expect)', () => {
    const ics = unfold(buildIcs('Advanced Tree Service', [ev({})], opts));
    expect(ics).toContain('X-WR-CALNAME:Advanced Tree Service schedule');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261117\r\nDTEND;VALUE=DATE:20261119');
    expect(ics).toContain('SUMMARY:Dana Smith · Traverse City');
    expect(ics).toContain('LOCATION:12 Pine Rd\\, Traverse City');
    expect(ics).toContain('URL:https://app.example.com/#/estimates/j1');
    expect(ics).toContain('DESCRIPTION:Tree work · E-1001\\nOpen in the app: https://app.example.com/#/estimates/j1');
    expect(ics).toContain('UID:e1@canopy-estimate');
  });
  it('puts a bid visit at its time, in UTC so daylight saving can’t shift it', () => {
    const ics = unfold(buildIcs('ATS', [ev({ type: 'estimate_visit', title: 'Bid · Jim Peterson', all_day: false, starts: '2026-11-17T14:00:00.000Z', ends: '2026-11-17T16:00:00.000Z', status: 'tentative' })], opts));
    expect(ics).toContain('DTSTART:20261117T140000Z\r\nDTEND:20261117T160000Z');
    expect(ics).toContain('STATUS:TENTATIVE');
  });
  it('copes with a missing end', () => {
    const ics = unfold(buildIcs('ATS', [ev({ ends: '' }), ev({ id: 'e2', all_day: false, starts: '2026-11-17T14:00:00.000Z', ends: '' })], opts));
    expect(ics).toContain('DTEND;VALUE=DATE:20261118');
    expect(ics).toContain('DTEND:20261117T150000Z');
  });
  it('escapes notes and keeps every line within 75 bytes', () => {
    const notes = 'Gate code 4471; dog is friendly, but call first.\nPark on the road. '.repeat(5);
    const ics = buildIcs('ATS', [ev({ notes, equipment: ['Stump grinder', 'Bucket truck'], crew: 'Sam, Joey' })], opts);
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const flat = unfold(ics);
    expect(flat).toContain('Gate code 4471\\; dog is friendly\\, but call first.\\nPark on the road.');
    expect(flat).toContain('Equipment: Stump grinder\\, Bucket truck');
    expect(flat).toContain('Crew: Sam\\, Joey');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('is an empty but valid calendar with nothing scheduled', () => {
    const ics = buildIcs('ATS', [], opts);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
    expect(ics).not.toContain('VEVENT');
  });
});
