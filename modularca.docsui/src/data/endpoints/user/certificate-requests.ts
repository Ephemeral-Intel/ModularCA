import type { ApiEndpoint } from '../types';

export const userCertificateRequests: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/user/requests',
        summary: 'List all certificate signing requests submitted by the authenticated user.',
        auth: 'Authorize (CaUser)',
        category: 'User Certificate Requests',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of requests with subject, status, submission date, and issued certificate serial.',
    },
    {
        method: 'POST',
        path: '/api/v1/user/requests',
        summary: 'Generate a new CSR with the given subject parameters.',
        auth: 'Authorize (CaUser)',
        category: 'User Certificate Requests',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Generated CSR in PEM format.',
    },
    {
        method: 'POST',
        path: '/api/v1/user/requests/upload',
        summary: 'Upload a pre-existing CSR for signing.',
        auth: 'Authorize (CaUser)',
        category: 'User Certificate Requests',
        requestBody: [
            { name: 'pem', type: 'string', required: true, description: 'CSR in PEM format' },
            { name: 'certificateProfileId', type: 'guid', required: true, description: 'Certificate profile to use' },
            { name: 'signingProfileId', type: 'guid', required: true, description: 'Signing profile to use' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Success confirmation.',
    },
];
