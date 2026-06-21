import type { ApiEndpoint } from '../../types';

export const adminOidOptions: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/oid-options',
        summary: 'List available OID options for certificate extensions.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin OID Options',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of OID options.',
    },
];
