import type { ApiEndpoint } from '../../types';
import { adminFeatureFlags } from './feature-flags';
import { adminOidOptions } from './oid-options';
import { adminPasswordPolicy } from './password';
import { adminSecurityPolicy } from './security';
import { adminRateLimitPolicy } from './rate-limit';
import { adminLdapPublisherPolicy } from './ldap-publisher';
import { adminNotifications } from './notifications';
import { adminQuotas } from './quotas';
import { adminWhitelists } from './whitelists';
import { adminAcmeEab } from './acme-eab';

export const adminPolicyEndpoints: ApiEndpoint[] = [
    ...adminFeatureFlags,
    ...adminOidOptions,
    ...adminPasswordPolicy,
    ...adminSecurityPolicy,
    ...adminRateLimitPolicy,
    ...adminLdapPublisherPolicy,
    ...adminNotifications,
    ...adminQuotas,
    ...adminWhitelists,
    ...adminAcmeEab,
];
