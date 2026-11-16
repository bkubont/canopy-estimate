import { describe, expect, it } from 'vitest';
import { planImport, toCustomer } from './contactsImport';
import { parseVCards } from './vcard';

const file = [
  'BEGIN:VCARD', 'VERSION:3.0', 'N:Smith;Dana;;;', 'FN:Dana Smith', 'TEL;type=CELL:+1 (231) 555-0101', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'N:Kowalski;Nadia;;;', 'TEL:231.555.0199', 'EMAIL:nadia@example.com', 'item1.ADR;type=HOME:;;4120 Peninsula Dr;Traverse City;MI;49686;', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'FN:Nadia K', 'EMAIL:NADIA@example.com', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'ORG:Hollis Point Cottage Assn', 'END:VCARD',
].join('\r\n');
const existing = [toCustomer({ firstName: 'Dana', lastName: 'Smith', phone: '231-555-0101' }, 'o')];

describe('importing contacts from an iPhone .vcf', () => {
  const rows = planImport(parseVCards(file), existing);
  it('reads every contact in the file', () => {
    expect(rows).toHaveLength(4);
    expect(rows[1]!.client).toMatchObject({ firstName: 'Nadia', lastName: 'Kowalski', town: 'Traverse City', zip: '49686' });
  });
  it('marks people already in Customers by phone, however it is written', () => {
    expect(rows[0]!.already).toBe('Dana Smith');
  });
  it('marks someone listed twice in the same file (same email)', () => {
    expect(rows[2]!.already).toBe('Nadia Kowalski (earlier in this file)');
  });
  it('keeps the new ones, companies included', () => {
    expect(rows[1]!.already).toBeNull();
    expect(rows[3]).toMatchObject({ already: null, client: { company: 'Hollis Point Cottage Assn' } });
  });
});
