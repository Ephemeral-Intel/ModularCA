import type { ApiEndpoint } from '../types';
import { adminCaAndCerts } from './ca-and-certs';
import { adminIdentity } from './identity';
import { adminProfiles } from './profiles';
import { adminCrlAndUrls } from './crl-and-urls';
import { adminPolicyEndpoints } from './policy';
import { adminConfig } from './config';
import { adminAuditEndpoints } from './audit';
import { adminSsh } from './ssh';
import { adminSchedulerEndpoints } from './scheduler';

export const admin: ApiEndpoint[] = [
    ...adminCaAndCerts,
    ...adminIdentity,
    ...adminProfiles,
    ...adminCrlAndUrls,
    ...adminPolicyEndpoints,
    ...adminConfig,
    ...adminAuditEndpoints,
    ...adminSsh,
    ...adminSchedulerEndpoints,
];
