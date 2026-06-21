import type { ApiEndpoint } from '../../types';

export const adminLdap: ApiEndpoint[] = [
    {
        method: 'POST',
        path: '/api/v1/admin/ldap/sync',
        summary: 'Trigger a full LDAP group sync for all users.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin LDAP',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Sync result summary.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/ldap/sync/{userId}',
        summary: 'Trigger an LDAP group sync for a specific user.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin LDAP',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Sync result for the user.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/ldap/group-mappings',
        summary: 'List LDAP-to-local group mappings.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin LDAP',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of LDAP group mappings.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/ldap/group-mappings',
        summary: 'Update LDAP-to-local group mappings.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin LDAP',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated mappings.',
    },
];
