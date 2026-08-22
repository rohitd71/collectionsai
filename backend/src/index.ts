// Combined single-process entry point for local dev and small deployments.
// In production, prefer running `api.ts` and `worker.ts` as separate
// processes/containers (see README "Deploying") so a burst of HTTP traffic
// can't starve the call/billing workers, and vice versa.
import './api';
import './worker';
