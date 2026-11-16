import { clientName, normalizeJob } from '../lib/estimate';
import { isWorkOrder } from '../lib/notes';
import { can, useReady } from '../lib/session';
import type { Job } from '../lib/types';
import { PaymentsButton } from './PaymentsButton';
import { PhotosButton } from './Photos';
import { WorkOrderNotes } from './WorkOrderNotes';

/**
 * The photo, notes and payment icons for a job card, anywhere in the app: each
 * opens right where you are. Notes only exist while the job is a work order;
 * payments only once it's signed, and only for owner and office.
 */
export function JobQuickIcons({ job: raw }: { job: Job }) {
  const { engine, org } = useReady();
  const job = normalizeJob(raw);
  return (
    <span className="quick-icons" onClick={(e) => e.stopPropagation()}>
      <PhotosButton jobId={job.id} label={clientName(job.client) || job.number} />
      {isWorkOrder(job) && <WorkOrderNotes icon job={job} onChange={(internal_notes) => void engine.save('jobs', { ...raw, internal_notes })} />}
      {can.seePrices(org.role) && job.signed_at && job.stage !== 'paid' && <PaymentsButton job={raw} />}
    </span>
  );
}
