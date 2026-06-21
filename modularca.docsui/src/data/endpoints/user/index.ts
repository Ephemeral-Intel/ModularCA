import type { ApiEndpoint } from '../types';
import { account } from './account';
import { userCertificates } from './certificates';
import { userCertificateRequests } from './certificate-requests';
import { userCaCertificates } from './ca-certificates';
import { userGroups } from './groups';
import { userSigningProfiles } from './signing-profiles';
import { userRequestProfiles } from './request-profiles';
import { userSsh } from './ssh';

export const user: ApiEndpoint[] = [
    ...account,
    ...userCertificates,
    ...userCertificateRequests,
    ...userCaCertificates,
    ...userGroups,
    ...userSigningProfiles,
    ...userRequestProfiles,
    ...userSsh,
];
