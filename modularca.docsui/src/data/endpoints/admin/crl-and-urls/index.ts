import type { ApiEndpoint } from '../../types';
import { adminCrl } from './crl';
import { adminCrlSchedules } from './schedules';
import { adminServiceUrls } from './service-urls';
import { adminProtocolConfigs } from './protocol-configs';
import { adminCtLogs } from './ct-logs';

export const adminCrlAndUrls: ApiEndpoint[] = [
    ...adminCrl,
    ...adminCrlSchedules,
    ...adminServiceUrls,
    ...adminProtocolConfigs,
    ...adminCtLogs,
];
