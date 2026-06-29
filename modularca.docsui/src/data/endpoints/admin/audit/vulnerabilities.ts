import type { ApiEndpoint } from '../../types';

export const adminVulnerabilities: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/compliance',
        summary: 'List all detected compliance findings with filtering.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Compliance',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of compliance finding records.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/compliance/summary',
        summary: 'Get an aggregate compliance findings summary.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Compliance',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Summary with counts by severity and type.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/compliance/{id}/resolve',
        summary: 'Mark a compliance finding as resolved.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Compliance',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Resolution confirmation.',
    },
];
