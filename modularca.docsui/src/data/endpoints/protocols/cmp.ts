import type { ApiEndpoint } from '../types';

export const cmp: ApiEndpoint[] = [
    {
        method: 'POST',
        path: '/api/v1/cmp/{caLabel}',
        summary: 'CMP POST handler for certificate management operations (RFC 4210).',
        auth: 'CMP Auth',
        category: 'CMP',
        responseDescription: 'CMP response message.',
    },
];
