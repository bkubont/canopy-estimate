// Calendar subscription for the iPhone/Mac Calendar app or Google Calendar.
//
//   GET /functions/v1/calendar-feed?t=<private link token>  →  text/calendar
//
// The token is the key (no sign-in), so JWT verification is OFF for this
// function. It asks the database for the link's calendar entries
// (public.calendar_feed_events: no prices, no cancelled entries) and turns them
// into a calendar file. One file, no other imports, so it can be pasted into the
// Supabase dashboard as is.

export interface FeedEvent {
  id: string; type: string; title: string; status: string; all_day: boolean;
  starts: string; ends: string; address: string; town: string; crew: string;
  equipment: string[] | null; notes: string; updated_at: string | null;
  job_id: string | null; job_number: string | null;
}

const LABEL: Record<string, string> = {
  estimate_visit: 'Bid visit', tree_work: 'Tree work', equipment_rental: 'Rental', dump_run: 'Dump run',
  maintenance: 'Maintenance', time_off: 'Time off', other: 'Other',
};

/** Text values: backslash, comma, semicolon and line breaks are escaped. */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Lines longer than 75 bytes continue on the next line after a space. */
function fold(line: string) {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const ymd = (s: string) => s.slice(0, 10).replace(/-/g, '');
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function nextDay(d: string) {
  const t = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/** The calendar file for a feed. `now` is passed in so tests are repeatable. */
export function buildIcs(company: string, events: FeedEvent[], opts: { appUrl: string; now: string }): string {
  const name = `${company || 'Tree service'} schedule`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Canopy Estimate//Calendar feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(name)}`, 'X-WR-TIMEZONE:America/Detroit',
    // Ask calendar apps to check back often (the iPhone decides for itself; Macs and Outlook listen).
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M',
  ];
  for (const e of events) {
    if (!e.starts) continue;
    const label = LABEL[e.type] ?? 'Other';
    const summary = e.title?.trim() || label;
    const where = [e.address, e.town].map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
    const link = e.job_id ? `${opts.appUrl}/#/estimates/${e.job_id}` : `${opts.appUrl}/#/calendar`;
    const details = [
      label + (e.job_number ? ` · ${e.job_number}` : ''),
      e.crew?.trim() ? `Crew: ${e.crew.trim()}` : '',
      e.equipment?.length ? `Equipment: ${e.equipment.join(', ')}` : '',
      e.notes?.trim() ?? '',
      `Open in the app: ${link}`,
    ].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@canopy-estimate`, `DTSTAMP:${utc(opts.now)}`);
    if (e.updated_at) lines.push(`LAST-MODIFIED:${utc(e.updated_at)}`);
    if (e.all_day) {
      const end = e.ends && e.ends.slice(0, 10) > e.starts.slice(0, 10) ? e.ends : nextDay(e.starts);
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.starts)}`, `DTEND;VALUE=DATE:${ymd(end)}`);
    } else {
      const end = e.ends && Date.parse(e.ends) > Date.parse(e.starts) ? e.ends : new Date(Date.parse(e.starts) + 3_600_000).toISOString();
      lines.push(`DTSTART:${utc(e.starts)}`, `DTEND:${utc(end)}`);
    }
    lines.push(`SUMMARY:${text(summary)}`);
    if (where) lines.push(`LOCATION:${text(where)}`);
    lines.push(`DESCRIPTION:${text(details)}`, `URL:${link}`, `STATUS:${e.status === 'tentative' ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- the server function

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(req: Request): Promise<Response> {
  const env = (globalThis as unknown as { Deno: { env: { get(k: string): string | undefined } } }).Deno.env;
  const token = (new URL(req.url).searchParams.get('t') ?? '').trim();
  const gone = () => new Response('This calendar link no longer works. Get a new one from Account in the app.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (!UUID.test(token)) return gone();
  // Straight to the database (always available to Supabase functions), so no API key is needed here.
  // @ts-ignore: Deno resolves npm: imports at run time
  const { default: postgres } = await import('npm:postgres@3.4.5');
  const sql = postgres(env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
  try {
    const [row] = await sql`select public.calendar_feed_events(${token}::uuid) as feed`;
    const feed = row.feed as { company: string; events: FeedEvent[] };
    const ics = buildIcs(feed.company, feed.events ?? [], { appUrl: env.get('APP_URL') ?? 'https://app.advanced-treeservice.com', now: new Date().toISOString() });
    return new Response(ics, {
      headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'inline; filename="schedule.ics"', 'cache-control': 'private, max-age=300' },
    });
  } catch (err) {
    if (/no longer works/.test(String((err as Error).message))) return gone();
    console.error(err);
    return new Response('The calendar is not available right now. Try again in a minute.', { status: 503 });
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const deno = (globalThis as unknown as { Deno?: { serve(h: (r: Request) => Promise<Response>): void } }).Deno;
if (deno?.serve) deno.serve(handle);
