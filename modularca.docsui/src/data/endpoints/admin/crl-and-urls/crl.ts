import type { ApiEndpoint } from '../../types';

export const adminCrl: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/crl/by-id/{caId}',
        summary: 'Get the latest CRL for a CA by its database ID (GUID). Response format depends on the Accept header.',
        auth: 'Authorize (CaAuditor)',
        category: 'Admin CRL',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'Accept', type: 'string', required: false, description: 'Set to application/pkix-crl for DER format, otherwise defaults to PEM' },
        ],
        responseDescription: 'CRL file download in PEM (default) or DER format based on Accept header.',
        notes: 'Returns 404 if the CA certificate is not found or no CRL exists. Returns 400 if the specified certificate is not a CA.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/crl/by-serial/{serial}',
        summary: 'Get the latest CRL for a CA by its certificate serial number. Response format depends on the Accept header.',
        auth: 'Authorize (CaAuditor)',
        category: 'Admin CRL',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'Accept', type: 'string', required: false, description: 'Set to application/pkix-crl for DER format, otherwise defaults to PEM' },
        ],
        responseDescription: 'CRL file download in PEM (default) or DER format based on Accept header.',
        notes: 'Returns 404 if the CA certificate is not found or no CRL exists. Returns 400 if the specified certificate is not a CA.',
    },
];
