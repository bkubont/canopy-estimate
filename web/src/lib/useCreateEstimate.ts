import { useNavigate } from 'react-router-dom';
import { blankJob, blankPricing } from './estimate';
import { takeNumber } from './numbers';
import { useReady, useRow } from './session';
import { reserveNumbers } from './supabase';

/** Start a new estimate with the next number on this device and open its first step. */
export function useCreateEstimate() {
  const { engine, org, user } = useReady();
  const company = useRow(engine, 'organizations', org.org_id);
  const orgPricing = useRow(engine, 'org_pricing', org.org_id);
  const me = useRow(engine, 'members', `${org.org_id}|${user.id}`);
  const nav = useNavigate();
  return async () => {
    if (!company) throw new Error('Company details haven’t synced yet. Try again in a moment.');
    const number = await takeNumber(engine.db, org.org_id, 'estimate', reserveNumbers);
    const job = blankJob({ org: company, number, preparedBy: me?.display_name ?? '', contractorSig: me?.signature_data ?? '' });
    await engine.save('jobs', job);
    await engine.save('job_pricing', blankPricing(job, orgPricing));
    nav(`/estimates/${job.id}/client`);
  };
}
