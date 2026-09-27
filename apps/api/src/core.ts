/* Browser-safe entry point: everything the MVP needs to run the backend
   in the browser (no express, pg or node:fs imports). */
export { createService, HttpError, type ServiceConfig, type ServiceRequest, type ServiceResponse } from './service';
export { MemoryRepo } from './repo/memory';
export { parseBank } from './bank-parse';
export { seedDemo, devCycles } from './dev/seed';
export { DEV_INSTITUTION } from './auth/dev-institution';
export type { AccessDecision, Cycle } from './access';
