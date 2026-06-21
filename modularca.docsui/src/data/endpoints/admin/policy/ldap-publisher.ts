import type { ApiEndpoint } from '../../types';

export const adminLdapPublisherPolicy: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/ldap-publisher/policy',
        summary: 'Get the global LDAP publisher job policy — master enable flag plus two tunables.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin LDAP Publisher',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'LDAP publisher policy row with Enabled, SinceFallbackHours, ConnectionTimeoutSeconds.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/ldap-publisher/policy',
        summary: 'Update the LDAP publisher policy. Partial update — null fields are left unchanged.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin LDAP Publisher',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-MFA-Token', type: 'string', required: true, description: 'Step-up MFA token scoped to update-config' },
        ],
        responseDescription: 'Updated LDAP publisher policy row.',
        notes: 'Flipping Enabled=true allows the scheduler to dispatch LdapPublisherJob for each enabled LdapConfigurations row on the next poll cycle.',
    },
];
