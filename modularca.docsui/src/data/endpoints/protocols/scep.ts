import type { ApiEndpoint } from '../types';

export const scep: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/scep/{caLabel}',
        summary: 'SCEP GET handler for GetCACaps, GetCACert, and GetNextCACert operations.',
        auth: 'Anonymous',
        category: 'SCEP',
        responseDescription: 'Depends on operation: capabilities, CA cert, or next CA cert.',
    },
    {
        method: 'POST',
        path: '/api/v1/scep/{caLabel}',
        summary: 'SCEP POST handler for PKIOperation (certificate enrollment/renewal).',
        auth: 'SCEP Challenge',
        category: 'SCEP',
        responseDescription: 'SCEP response message.',
    },
];
