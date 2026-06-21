import type { ApiEndpoint } from '../../types';

export const adminPasswordPolicy: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/password-policy',
        summary: 'Get the current password policy configuration.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Password Policy',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Password policy settings.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/password-policy',
        summary: 'Update the password policy configuration.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Password Policy',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated password policy.',
    },
];
