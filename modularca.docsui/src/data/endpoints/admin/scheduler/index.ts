import type { ApiEndpoint } from '../../types';
import { adminScheduler } from './scheduler';

export const adminSchedulerEndpoints: ApiEndpoint[] = [
    ...adminScheduler,
];
