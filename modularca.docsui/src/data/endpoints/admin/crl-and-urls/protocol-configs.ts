import type { ApiEndpoint } from '../../types';

export const adminProtocolConfigs: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/protocol-configs/{caId}',
        summary: 'Get protocol configurations for a specific CA.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Protocol Configs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Protocol configurations with signing/cert profile assignments.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/protocol-configs/{caId}/{protocol}',
        summary: 'Update a protocol configuration for a CA.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Protocol Configs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated protocol configuration.',
    },
];
