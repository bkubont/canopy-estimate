import { describe, expect, it } from 'vitest';
import { blankEvent, miToIso } from './calendar';
import { bellItems } from './notifications';

const job = (o: object) => ({ id: 'j1', org_id: 'o', number: 'E-1001', stage: 'estimate', status: 'approved', client: { firstName: 'Dana', lastName: 'Smith' },
  trees: [], equipment: [], change_orders: [], days: 2, site: {}, signed_at: null, signed_via: '', updated_by: 'someone', updated_at: '2026-11-15T15:00:00Z', deleted_at: null, ...o }) as never;
const base = { payments: [], invoices: [], events: [], timeEntries: [], me: { id: 'me', name: 'Joey' }, office: true, today: '2026-11-15', nowIso: '2026-11-15T18:00:00Z' };

describe('the bell', () => {
  it('rings when a customer signs online, and when a job is blocked by someone else', () => {
    const items = bellItems({ ...base, jobs: [job({ signed_at: '2026-11-15T14:00:00Z', signed_via: 'link', status: 'blocked', block_reason: 'Weather' })] });
    expect(items.map((i) => i.text)).toEqual(['Dana Smith is blocked: weather', 'Dana Smith signed the estimate online (E-1001)']);
  });
  it('stays quiet about things you did yourself', () => {
    const items = bellItems({ ...base, jobs: [job({ status: 'blocked', updated_by: 'me' })],
      payments: [{ id: 'p', org_id: 'o', job_id: 'j1', amount: 500, method: 'check', received_on: '2026-11-15', recorded_by_name: 'Joey', voided_at: null, deleted_at: null, created_at: '2026-11-15T16:00:00Z' } as never] });
    expect(items).toEqual([]);
  });
  it('tells the office about payments and overdue invoices, never the crew', () => {
    const input = { ...base, jobs: [job({})],
      payments: [{ id: 'p', org_id: 'o', job_id: 'j1', amount: 500, method: 'check', received_on: '2026-11-15', recorded_by_name: 'Sam', voided_at: null, deleted_at: null, created_at: '2026-11-15T16:00:00Z' } as never],
      invoices: [{ id: 'i', org_id: 'o', job_id: 'j1', number: 'INV-1001', status: 'sent', issue_date: '2026-11-01', due_date: '2026-11-10', lines: [{ id: 'l', desc: 'x', qty: 1, unit: 1000, taxable: false }], tax_rate: 0, deleted_at: null } as never] };
    expect(bellItems(input).map((i) => i.text)).toEqual(['$500.00 check payment from Dana Smith', 'INV-1001 to Dana Smith is overdue ($500.00)']);
    expect(bellItems({ ...input, office: false })).toEqual([]);
  });
  it('after 4 pm, reminds you to log hours for a job that was on today’s calendar', () => {
    const ev = blankEvent('o', { type: 'tree_work', job_id: 'j1', starts: '2026-11-15', ends: '2026-11-16', assigned_to: ['me'] });
    const morning = bellItems({ ...base, jobs: [job({})], events: [ev], nowIso: miToIso('2026-11-15', '11:00') });
    expect(morning).toEqual([]);
    const evening = bellItems({ ...base, jobs: [job({})], events: [ev], nowIso: miToIso('2026-11-15', '17:35') });
    expect(evening.map((i) => i.text)).toEqual(['Log today’s hours for Dana Smith']);
    const logged = bellItems({ ...base, jobs: [job({})], events: [ev], nowIso: miToIso('2026-11-15', '17:35'),
      timeEntries: [{ id: 't', org_id: 'o', job_id: 'j1', work_date: '2026-11-15', hours: 8, deleted_at: null } as never] });
    expect(logged).toEqual([]);
  });
});
