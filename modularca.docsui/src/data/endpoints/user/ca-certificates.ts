import type { ApiEndpoint } from '../types';

export const userCaCertificates: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/user/authorities',
        summary: 'List all CA certificates available to the authenticated user.',
        auth: 'Authorize (CaUser)',
        category: 'User CA Certificates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of CA certificate info models.',
    },
    {
        method: 'GET',
        path: '/api/v1/user/authorities/{serial}',
        summary: 'Get detailed CA certificate information by serial number.',
        auth: 'Authorize (CaUser)',
        category: 'User CA Certificates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Full CA certificate info.',
    },
    {
        method: 'GET',
        path: '/api/v1/user/authorities/{serial}/file',
        summary: 'Download a CA certificate file in PEM or DER format.',
        auth: 'Authorize (CaUser)',
        category: 'User CA Certificates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'Accept', type: 'string', required: false, description: 'Content type preference (e.g., application/x-pem-file or application/pkix-cert)' },
        ],
        responseDescription: 'CA certificate file download.',
    },
    {
        method: 'GET',
        path: '/api/v1/user/authorities/{serial}/chain',
        summary: 'Download the full trust chain for a CA certificate.',
        auth: 'Authorize (CaUser)',
        category: 'User CA Certificates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'PEM bundle file with the CA certificate and its issuer chain.',
    },
    {
        method: 'GET',
        path: '/api/v1/user/authorities/{serial}/crl',
        summary: 'Download the CRL for a specific CA by certificate serial number.',
        auth: 'Authorize (CaUser)',
        category: 'User CA Certificates',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'CRL file download in DER format.',
    },
];
