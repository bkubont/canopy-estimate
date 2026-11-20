import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrewDoc } from '../components/CrewDoc';
import { blankJob, blankTree } from './estimate';
import {
  buildCrewSheet, buildCustomerLabels, buildJobLabel, crewSheetHasNoPrices,
  parsePropertyFieldsFromNotes, teamNotesForCrew,
} from './crewPrint';
import type { Customer, CustomerProperty, Organization } from './types';

const org = { id: 'o1', name: 'Advanced Tree Service' } as Organization;

describe('crewPrint', () => {
  it('parses Gate/Access/Trees lines from internal notes', () => {
    expect(parsePropertyFieldsFromNotes('Gate: 4411\nAccess: Side yard\nTrees: Big oak\n\nDog out back\n— Sam · Nov 15')).toEqual({
      gate: '4411', access: 'Side yard', treeNotes: 'Big oak',
    });
  });

  it('keeps team notes that are not property field lines', () => {
    const notes = teamNotesForCrew('Gate: 4411\nAccess: Side\n\nDog out back\n— Sam · Nov 15');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.text).toContain('Dog out back');
  });

  it('builds a crew sheet from job + property with no prices', () => {
    const job = blankJob({ org, number: 'E-1001', preparedBy: 'Joey', contractorSig: '' });
    job.client = { ...job.client, firstName: 'Dana', lastName: 'Smith', phone: '231-555-0100', street: '1 Main', town: 'Leland', state: 'MI', zip: '49654' };
    job.internal_notes = 'Gate: 9999\nAccess: Front\n\nBring extra rope\n— Joey · Nov 14';
    job.client_notes = 'Haul brush';
    job.trees = [{ ...blankTree(), species: 'Ash', notes: 'Lean', internal_notes: 'Bring rigging', location: 'Front Yard', size: '18-24' }];
    job.site.conditions = ['Clear Access'];
    job.site.other = 'dogs';
    job.site.septic = 'Septic tank';
    job.site.septic_where = 'back';
    job.equipment = [{ id: 'e1', desc: 'Stump grinder', qty: 1, qty_manual: false }];
    job.property_id = 'p1';

    const property: CustomerProperty = {
      id: 'p1', org_id: 'o1', customer_id: 'c1', street: '12 Shore', town: 'Suttons Bay', state: 'MI', zip: '49682',
      gate_code: '4411', access: 'Drive around back', hazards: ['overhead wires'], tree_notes: 'Big oak',
      sort: 0, deleted_at: null,
    };

    const sheet = buildCrewSheet(job, {
      companyName: 'Advanced Tree Service',
      property,
      scheduleStart: '2026-11-20',
      scheduleEnd: '2026-11-21',
    });

    expect(sheet.number).toBe('E-1001');
    expect(sheet.addressLines[0]).toBe('12 Shore');
    expect(sheet.site.gate).toBe('4411');
    expect(sheet.site.access).toBe('Drive around back');
    expect(sheet.site.hazards).toContain('overhead wires');
    expect(sheet.site.hazards).toContain('dogs');
    expect(sheet.site.septicWarn).toBe(true);
    expect(sheet.trees[0]!.crewNotes).toBe('Bring rigging');
    expect(sheet.teamNotes.some((n) => n.text.includes('Bring extra rope'))).toBe(true);
    expect(crewSheetHasNoPrices(sheet)).toBe(true);

    const html = renderToStaticMarkup(<CrewDoc sheet={sheet} />);
    expect(html).toContain('Crew sheet');
    expect(html).toContain('4411');
    expect(html).toContain('Bring rigging');
    expect(html).toContain('Bring extra rope');
    expect(html).not.toMatch(/\$\d/);
    expect(html).not.toMatch(/day_rate|Total|deposit/i);
  });

  it('builds job and customer address labels', () => {
    const job = blankJob({ org, number: 'E-2', preparedBy: '', contractorSig: '' });
    job.client.firstName = 'Pat';
    job.client.lastName = 'Lee';
    job.client.street = '9 Pine';
    job.client.town = 'Traverse City';
    job.client.state = 'MI';
    job.client.zip = '49684';
    job.client.phone = '231-555-0111';
    const label = buildJobLabel(job);
    expect(label.name).toBe('Pat Lee');
    expect(label.lines[0]).toBe('9 Pine');
    expect(label.meta).toBe('E-2');

    const customer = {
      first_name: 'Pat', last_name: 'Lee', company: '', phone: '231-555-0111',
      street: '9 Pine', town: 'Traverse City', state: 'MI', zip: '49684',
    } as Customer;
    const props: CustomerProperty[] = [{
      id: 'p1', org_id: 'o1', customer_id: 'c1', street: '12 Shore', town: 'Suttons Bay', state: 'MI', zip: '49682',
      gate_code: '', access: '', hazards: [], tree_notes: '', sort: 0, deleted_at: null,
    }];
    expect(buildCustomerLabels(customer, props)[0]!.lines[0]).toBe('12 Shore');
  });
});
