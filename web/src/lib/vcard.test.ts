import { describe, expect, it } from 'vitest';
import { decodeBytes, parseVCards, toVCard } from './vcard';

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
  it('skips a contact photo and Apple labels in a real iPhone export', () => {
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0', 'PRODID:-//Apple Inc.//iPhone OS 18.1//EN', 'N:Nowak;Kasia;;;', 'FN:Kasia Nowak',
      'item1.TEL;type=pref:+1 (231) 555-0199', 'item1.X-ABLabel:_$!<Mobile>!$_',
      'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAA', ' MqADAAQAAAABAAAAMgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs',
      'END:VCARD',
    ].join('\n');
    expect(parseVCards(vcf)).toEqual([{ firstName: 'Kasia', lastName: 'Nowak', phone: '+1 (231) 555-0199' }]);
  });
  it('reads older quoted-printable cards (Android, Outlook)', () => {
    const vcf = ['BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Bront=C3=AB;Ren=', '=C3=A9;;;', 'TEL;CELL:2315550123', 'END:VCARD'].join('\r\n');
    expect(parseVCards(vcf)).toEqual([{ firstName: 'René', lastName: 'Brontë', phone: '2315550123' }]);
  });
  it('reads files saved as UTF-16 or Windows-1252', () => {
    const text = 'BEGIN:VCARD\r\nFN:José Ruiz\r\nEND:VCARD';
    const le = new Uint8Array([0xff, 0xfe, ...Array.from(text).flatMap((ch) => [ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8])]);
    expect(parseVCards(decodeBytes(le))[0]).toMatchObject({ firstName: 'José', lastName: 'Ruiz' });
    const cp1252 = new Uint8Array(Array.from(text).map((ch) => ch.charCodeAt(0)));
    expect(parseVCards(decodeBytes(cp1252))[0]).toMatchObject({ firstName: 'José' });
  });
  it('writes a card that reads back the same (and keeps commas and long notes safe)', () => {
    const c = { firstName: 'Dana', lastName: 'Smith', company: 'Smith Farms, LLC', phone: '(231) 555-0101', email: 'dana@example.com', street: '12 Pine Rd; Unit B', town: 'Traverse City', state: 'MI', zip: '49684' };
    const card = toVCard(c, 'ATS customer. Gate code 4471, dog is friendly. '.repeat(4));
    expect(card.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(parseVCards(card)).toEqual([c]);
  });
  it('writes a company-only card that shows as the company', () => {
    const card = toVCard({ company: 'Hollis Point Cottage Assn', phone: '231 555 0177' });
    expect(card).toContain('FN:Hollis Point Cottage Assn');
    expect(card).toContain('X-ABShowAs:COMPANY');
  });
});
