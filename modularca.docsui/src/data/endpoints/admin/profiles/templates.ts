import type { ApiEndpoint } from '../../types';

export const adminTemplates: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/templates',
        summary: 'List all certificate templates.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Templates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of certificate templates.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/templates/{id}',
        summary: 'Get a certificate template by ID.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Templates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Template details.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/templates/by-name/{name}',
        summary: 'Look up a certificate template by name.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Templates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Template details.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/templates',
        summary: 'Create a new certificate template.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Templates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Created template.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/templates/{id}',
        summary: 'Update a certificate template.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Templates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated template.',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/templates/{id}',
        summary: 'Delete a certificate template.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Templates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Deletion confirmation.',
    },
];
