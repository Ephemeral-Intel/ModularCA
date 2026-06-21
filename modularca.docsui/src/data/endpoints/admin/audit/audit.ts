import type { ApiEndpoint } from '../../types';

export const adminAudit: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/audit',
        summary: 'Query audit log entries with filtering and pagination.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Audit',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Paginated array of audit log entries.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/audit/{id}',
        summary: 'Get a specific audit log entry by ID.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Audit',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Audit log entry details.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/audit/est',
        summary: 'Query EST protocol audit logs.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Audit',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'EST audit entries.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/audit/scep',
        summary: 'Query SCEP protocol audit logs.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Audit',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'SCEP audit entries.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/audit/cmp',
        summary: 'Query CMP protocol audit logs.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Audit',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'CMP audit entries.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/audit/acme',
        summary: 'Query ACME protocol audit logs.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Audit',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'ACME audit entries.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/audit/network',
        summary: 'Query network-level audit logs.',
        auth: 'Authorize (SystemAuditor)',
        category: 'Admin Audit',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Network audit entries.',
    },
];
