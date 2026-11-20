import type { CrewSheet } from '../lib/crewPrint';

const KV = ({ label, value }: { label: string; value?: string | null }) =>
  value ? <div className="kv"><b>{label}:</b><span>{value}</span></div> : null;

/** Crew job sheet — site, access, trees, team notes. Never includes prices. */
export function CrewDoc({ sheet }: { sheet: CrewSheet }) {
  const site = sheet.site;
  const siteRows = [
    site.gate ? <KV key="g" label="Gate" value={site.gate} /> : null,
    site.access ? <KV key="a" label="Access" value={site.access} /> : null,
    site.hazards.length ? <KV key="h" label="Hazards" value={site.hazards.join(', ')} /> : null,
    site.conditions.length ? <KV key="c" label="Site" value={site.conditions.join(', ')} /> : null,
    site.parking ? <KV key="p" label="Parking" value={site.parking} /> : null,
    site.debris ? <KV key="d" label="Wood & debris" value={site.debris} /> : null,
    site.septic ? (
      <KV key="sp" label="Septic / drain field" value={site.septicWarn ? `⚠ ${site.septic}` : site.septic} />
    ) : null,
    site.treeNotes ? <KV key="t" label="Tree notes" value={site.treeNotes} /> : null,
  ].filter(Boolean);

  return (
    <article className="doc crew-doc">
      <header className="doc-head" data-break>
        <div className="doc-brand">
          <div className="doc-brand-name">{sheet.companyName}</div>
          <h1>Crew sheet</h1>
        </div>
        <div className="doc-no">
          <b>{sheet.number}</b>
          <br />
          {sheet.scheduleLabel}
        </div>
      </header>

      <div className="doc-cols" data-break>
        <section className="doc-sec">
          <h3>Client</h3>
          <div className="doc-sec-body">
            <KV label="Name" value={sheet.clientName} />
            {sheet.company && sheet.company !== sheet.clientName ? <KV label="Company" value={sheet.company} /> : null}
            <KV label="Phone" value={sheet.phone} />
            <KV label="Address" value={sheet.addressLines.join('\n')} />
          </div>
        </section>
        <section className="doc-sec">
          <h3>Site &amp; access</h3>
          <div className="doc-sec-body">
            {siteRows.length ? siteRows : <span className="doc-muted">None</span>}
            <KV label="Days" value={sheet.days ? String(sheet.days) : ''} />
            <KV label="Equipment" value={sheet.equipment.join(', ') || 'none'} />
          </div>
        </section>
      </div>

      <section className="doc-sec" data-break>
        <h3>Trees ({sheet.trees.length})</h3>
        <div className="doc-sec-body">
          <table className="doc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tree / work</th>
                <th>Location / size</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sheet.trees.length ? sheet.trees.map((t, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><b>{t.title || '—'}</b></td>
                  <td>{t.details || '—'}</td>
                  <td>
                    {t.notes}
                    {t.crewNotes ? <div className="doc-note crew-note"><b>Crew:</b> {t.crewNotes}</div> : null}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="none">None</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(sheet.teamNotes.length > 0 || sheet.clientNotes) && (
        <section className="doc-sec" data-break>
          <h3>Notes for the crew</h3>
          <div className="doc-sec-body">
            {sheet.clientNotes ? <KV label="Client notes" value={sheet.clientNotes} /> : null}
            {sheet.teamNotes.map((n, i) => (
              <div key={i} className="crew-team-note">
                <div className="pre">{n.text}</div>
                {n.by ? <div className="doc-muted small">— {n.by}{n.when ? ` · ${n.when}` : ''}</div> : null}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="doc-terms" data-break>
        For the crew only — no pricing. Gate codes and hazards stay with the team.
      </footer>
    </article>
  );
}
