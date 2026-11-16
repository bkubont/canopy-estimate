import { clientName, normalizeJob } from '../lib/estimate';
import { isWorkOrder } from '../lib/notes';
import { useReady } from '../lib/session';
import type { Job } from '../lib/types';
import { PhotosButton } from './Photos';
import { WorkOrderNotes } from './WorkOrderNotes';

/**
 * The photo and notes icons for a job card, anywhere in the app: each opens
 * right where you are. Notes only exist while the job is a work order.
 */
export function JobQuickIcons({ job: raw }: { job: Job }) {
  const { engine } = useReady();
  const job = normalizeJob(raw);
  return (
    <span className="quick-icons" onClick={(e) => e.stopPropagation()}>
      <PhotosButton jobId={job.id} label={clientName(job.client) || job.number} />
      {isWorkOrder(job) && <WorkOrderNotes icon job={job} onChange={(internal_notes) => void engine.save('jobs', { ...raw, internal_notes })} />}
    </span>
  );
}
