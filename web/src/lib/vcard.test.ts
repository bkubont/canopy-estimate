import { describe, expect, it } from 'vitest';
import { parseVCards } from './vcard';

describe('parseVCards', () => {
  it('reads an Apple contacts export with several people', () => {
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Smith;Dana;;;', 'FN:Dana Smith', 'ORG:Smith Farms;',
      'item1.TEL;type=CELL:(231) 555-0101', 'EMAIL;type=INTERNET:dana@example.com',
      'item2.ADR;type=HOME:;;12 Pine Rd;Traverse City;Michigan;49684;USA', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Pat Jones', 'TEL:231-555-0102', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'NOTE:empty card', 'END:VCARD',
    ].join('\r\n');
    const cards = parseVCards(vcf);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({
      firstName: 'Dana', lastName: 'Smith', company: 'Smith Farms', phone: '(231) 555-0101',
      email: 'dana@example.com', street: '12 Pine Rd', town: 'Traverse City', state: 'MI', zip: '49684',
    });
    expect(cards[1]).toMatchObject({ firstName: 'Pat', lastName: 'Jones', phone: '231-555-0102' });
  });
});
