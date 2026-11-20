import type { CrewLabel } from '../lib/crewPrint';

/**
 * Avery 5160-style address labels (3 × 10 on letter).
 * Print with “Actual size” / 100% scaling for correct label alignment.
 */
export function CrewLabelDoc({ labels, title }: { labels: CrewLabel[]; title?: string }) {
  // Fill a full sheet so print alignment stays predictable.
  const cells = [...labels];
  while (cells.length < 30) cells.push({ name: '', lines: [] });
  const sheet = cells.slice(0, 30);

  return (
    <div className="label-sheet" data-label-title={title || 'Labels'}>
      {sheet.map((l, i) => (
        <div key={i} className={`label-cell${l.name || l.lines.length ? '' : ' empty'}`}>
          {l.name || l.lines.length ? (
            <>
              <div className="label-name">{l.name}</div>
              {l.lines.map((line, j) => (
                <div key={j} className="label-line">{line}</div>
              ))}
              {l.phone ? <div className="label-meta">{l.phone}</div> : null}
              {l.meta ? <div className="label-meta">{l.meta}</div> : null}
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
