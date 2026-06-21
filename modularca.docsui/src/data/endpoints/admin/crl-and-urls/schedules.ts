import type { ApiEndpoint } from '../../types';

export const adminCrlSchedules: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/crl-schedules',
        summary: 'List all CRL generation schedules.',
        auth: 'Authorize (CaAuditor)',
        category: 'Admin CRL Schedules',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of CRL schedules.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/crl-schedules/{id}',
        summary: 'Get a CRL schedule by ID.',
        auth: 'Authorize (CaAuditor)',
        category: 'Admin CRL Schedules',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'CRL schedule details.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/crl-schedules',
        summary: 'Create a new CRL generation schedule.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CRL Schedules',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Created CRL schedule.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/crl-schedules/{id}',
        summary: 'Update a CRL schedule.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CRL Schedules',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated CRL schedule.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/crl-schedules/{id}/status',
        summary: 'Enable or disable a CRL schedule.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CRL Schedules',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Status update confirmation.',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/crl-schedules/{id}',
        summary: 'Delete a CRL schedule.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CRL Schedules',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Deletion confirmation.',
    },
];
