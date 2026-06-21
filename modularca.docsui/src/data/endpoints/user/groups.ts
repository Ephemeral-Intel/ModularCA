import type { ApiEndpoint } from '../types';

export const userGroups: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/user/groups',
        summary: 'List all groups the authenticated user belongs to.',
        auth: 'Authorize (CaUser)',
        category: 'User Groups',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of group memberships with group name, role level, and CA scope.',
    },
];
