import { STAGE_LABEL, type Stage } from '../lib/status';

/** A status pill in the stage's color, always with a word so color is never the only signal. */
export function Pill({ stage, label }: { stage: Stage | 'neutral'; label?: string }) {
  return (
    <span className={`pill st-${stage}`}>
      <span className="pill-dot" aria-hidden="true" />
      {label ?? (stage === 'neutral' ? '' : STAGE_LABEL[stage])}
    </span>
  );
}
