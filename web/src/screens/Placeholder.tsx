export function Placeholder({ title, phase, note }: { title: string; phase: string; note: string }) {
  return (
    <div className="page">
      <div className="page-head"><h2>{title}</h2></div>
      <div className="coming">
        <b>Coming in {phase}</b>
        <p className="muted">{note}</p>
      </div>
    </div>
  );
}
