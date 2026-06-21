import type { ApiEndpoint } from '../../types';

export const adminRateLimitPolicy: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/rate-limit-policy',
        summary: 'List every per-protocol rate-limit row. Protocols with no row fall back to the middleware-built-in defaults.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Rate Limit Policy',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of { id, protocol, maxRequests, windowMinutes, updatedAt } rows.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/rate-limit-policy',
        summary: 'Bulk upsert per-protocol rate limits. Body is a map of protocol name to { maxRequests, windowMinutes }. Protocols not in the body are left alone (use DELETE for removal).',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Rate Limit Policy',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-MFA-Token', type: 'string', required: true, description: 'Step-up MFA token scoped to update-config' },
        ],
        responseDescription: 'Update confirmation with the list of updated protocol names.',
        notes: 'Changes take effect on the next request scope (cache invalidated on PUT).',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/rate-limit-policy/{protocol}',
        summary: 'Remove the custom rate-limit row for a protocol, reverting it to the middleware-built-in default.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Rate Limit Policy',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-MFA-Token', type: 'string', required: true, description: 'Step-up MFA token scoped to update-config' },
        ],
        responseDescription: 'Confirmation message.',
    },
];
