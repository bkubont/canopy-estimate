import type { Client } from './types';

/**
 * Read a contacts file as text, whatever its encoding: iPhone and Mac write
 * UTF-8, but some exports (Outlook, older phones) are UTF-16 or Windows-1252.
 */
export async function readContactsFile(f: Blob): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  return decodeBytes(bytes);
}

export function decodeBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  // UTF-16 without a byte-order mark: every other byte is zero.
  if (bytes.length > 3 && bytes[1] === 0 && bytes[3] === 0) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length > 3 && bytes[0] === 0 && bytes[2] === 0) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** vCard 2.1 "quoted-printable" values (Android, Outlook): =C3=A9 → é. */
function decodeQp(v: string) {
  const bytes: number[] = [];
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '=' && /^[0-9A-F]{2}$/i.test(v.slice(i + 1, i + 3))) { bytes.push(parseInt(v.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(...new TextEncoder().encode(v[i]!));
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

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
  // Quoted-printable values continue onto the next line after a trailing "=".
  const lines: string[] = [];
  for (const l of body.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
    const prev = lines[lines.length - 1];
    if (prev !== undefined && /QUOTED-PRINTABLE/i.test(prev.slice(0, prev.indexOf(':'))) && prev.endsWith('=')) lines[lines.length - 1] = prev.slice(0, -1) + l;
    else lines.push(l);
  }
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const params = line.slice(0, i);
    const k = params.split(';')[0]!.toUpperCase().replace(/^ITEM\d+\./, '');
    const raw = /QUOTED-PRINTABLE/i.test(params) ? decodeQp(line.slice(i + 1)) : line.slice(i + 1);
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
