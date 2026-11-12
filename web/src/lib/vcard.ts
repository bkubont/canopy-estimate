import type { Client } from './types';

/** Read every contact from a .vcf file (Apple / Google Contacts export). */
export function parseVCards(text: string): Partial<Client>[] {
  return String(text || '')
    .split(/BEGIN:VCARD/i)
    .slice(1)
    .map((chunk) => parseOne(chunk.split(/END:VCARD/i)[0] ?? ''))
    .filter((c) => c.firstName || c.lastName || c.company || c.phone || c.email);
}

function parseOne(body: string): Partial<Client> {
  const out: Partial<Client> & { fn?: string; n?: string[] } = {};
  const unesc = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
  for (const line of body.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).split(';')[0]!.toUpperCase().replace(/^ITEM\d+\./, '');
    const raw = line.slice(i + 1);
    if (k === 'FN' && !out.fn) out.fn = unesc(raw);
    if (k === 'N' && !out.n) out.n = raw.split(';').map(unesc);
    if (k === 'ORG' && !out.company) out.company = unesc(raw.split(';')[0] ?? '');
    if (k === 'TEL' && !out.phone) out.phone = unesc(raw);
    if (k === 'EMAIL' && !out.email) out.email = unesc(raw);
    if (k === 'ADR' && !out.street) {
      const parts = raw.replace(/\\;/g, '\u0000').split(';').map((x) => unesc(x.replace(/\u0000/g, ';')));
      out.street = parts[2] ?? '';
      out.town = parts[3] ?? '';
      out.state = (parts[4] ?? '').slice(0, 2).toUpperCase();
      out.zip = parts[5] ?? '';
    }
  }
  if (out.n) {
    out.lastName = out.n[0] ?? '';
    out.firstName = out.n[1] ?? '';
  } else if (out.fn) {
    const [first = '', ...rest] = out.fn.split(/\s+/);
    out.firstName = first;
    out.lastName = rest.join(' ');
  }
  delete out.fn;
  delete out.n;
  return out;
}
