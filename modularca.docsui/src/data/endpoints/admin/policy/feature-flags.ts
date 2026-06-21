import type { ApiEndpoint } from '../../types';

export const adminFeatureFlags: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/features',
        summary: 'List all feature flags and their current values.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Feature Flags',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of feature flags.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/features/{name}',
        summary: 'Get a feature flag by name.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Feature Flags',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Feature flag details.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/features/{name}',
        summary: 'Update a feature flag value.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Feature Flags',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated feature flag.',
    },
];
