import type { ApiEndpoint } from '../../types';

export const adminCtLogs: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/ct-logs',
        summary: 'List all Certificate Transparency log configurations.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CT Logs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of CT log entries.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/ct-logs/{id}',
        summary: 'Get a CT log configuration by ID.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CT Logs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'CT log details.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/ct-logs',
        summary: 'Create a new CT log configuration.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CT Logs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Created CT log entry.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/ct-logs/{id}',
        summary: 'Update a CT log configuration.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CT Logs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated CT log entry.',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/ct-logs/{id}',
        summary: 'Delete a CT log configuration.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CT Logs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Deletion confirmation.',
    },
];
