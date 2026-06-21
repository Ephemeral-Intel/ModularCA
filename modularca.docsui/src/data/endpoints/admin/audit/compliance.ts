import type { ApiEndpoint } from '../../types';

export const adminCompliance: ApiEndpoint[] = [
    {
        method: 'POST',
        path: '/api/v1/admin/compliance/report',
        summary: 'Generate a compliance report.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Compliance',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Compliance report data.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/compliance/export/csv',
        summary: 'Export a compliance report as CSV.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Compliance',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'CSV file download.',
    },
];
