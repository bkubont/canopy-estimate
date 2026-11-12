import type { Job, JobPricing } from '../../lib/types';

export interface StepProps {
  job: Job;
  pricing: JobPricing;
  updateJob: (fn: (j: Job) => Job) => void;
  updatePricing: (fn: (p: JobPricing) => JobPricing) => void;
}
