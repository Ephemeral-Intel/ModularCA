import type { ApiEndpoint } from '../types';

export const userSigningProfiles: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/user/signing-profiles',
        summary: 'List all signing profiles available for certificate requests.',
        auth: 'Authorize (CaUser)',
        category: 'User Signing Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of signing profiles with ID, name, description, and default status.',
    },
];
