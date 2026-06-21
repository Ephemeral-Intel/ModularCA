import type { ApiEndpoint } from '../types';

export const userRequestProfiles: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/user/request-profiles',
        summary: 'List all request profiles available to the authenticated user.',
        auth: 'Authorize (CaUser)',
        category: 'User Request Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of request profiles with allowed signing/cert profiles and constraints.',
    },
];
