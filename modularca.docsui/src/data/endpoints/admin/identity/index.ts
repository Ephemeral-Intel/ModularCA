import type { ApiEndpoint } from '../../types';
import { adminGroups } from './groups';
import { adminUsers } from './users';
import { adminTenants } from './tenants';
import { adminCertPermissions } from './cert-permissions';
import { adminEnrollmentTokens } from './enrollment-tokens';

export const adminIdentity: ApiEndpoint[] = [
    ...adminGroups,
    ...adminUsers,
    ...adminTenants,
    ...adminCertPermissions,
    ...adminEnrollmentTokens,
];
