import type { ApiEndpoint } from '../../types';

export const adminVulnerabilities: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/vulnerabilities',
        summary: 'List all detected vulnerabilities with filtering.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Vulnerabilities',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of vulnerability records.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/vulnerabilities/summary',
        summary: 'Get an aggregate vulnerability summary.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Vulnerabilities',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Summary with counts by severity and type.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/vulnerabilities/{id}/resolve',
        summary: 'Mark a vulnerability as resolved.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Vulnerabilities',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Resolution confirmation.',
    },
];
