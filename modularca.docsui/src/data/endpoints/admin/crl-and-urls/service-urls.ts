import type { ApiEndpoint } from '../../types';

export const adminServiceUrls: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/ca-service-urls',
        summary: 'List all CA service URL configurations.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CA Service URLs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of service URL configurations with CDP, OCSP, and CA Issuer URLs.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/ca-service-urls/{caCertificateId}',
        summary: 'Get service URLs for a specific CA certificate.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CA Service URLs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Service URL configuration.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/ca-service-urls/{caCertificateId}',
        summary: 'Update service URLs for a CA certificate.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CA Service URLs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated service URL configuration.',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/ca-service-urls/{caCertificateId}',
        summary: 'Delete service URL configuration for a CA certificate.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin CA Service URLs',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Deletion confirmation.',
    },
];
