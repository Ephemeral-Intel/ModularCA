import type { ApiEndpoint } from '../types';

export const publicShortUrls: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/ca/{serial}',
        summary: 'Short URL: download a CA certificate by serial.',
        auth: 'Anonymous',
        category: 'Public Short URLs',
        responseDescription: 'CA certificate file.',
    },
    {
        method: 'GET',
        path: '/crl/{serial}',
        summary: 'Short URL: download a CRL by CA serial.',
        auth: 'Anonymous',
        category: 'Public Short URLs',
        responseDescription: 'CRL file.',
    },
    {
        method: 'GET',
        path: '/crl/{serial}/delta',
        summary: 'Short URL: download a delta CRL by CA serial.',
        auth: 'Anonymous',
        category: 'Public Short URLs',
        responseDescription: 'Delta CRL file.',
    },
    {
        method: 'POST',
        path: '/ocsp',
        summary: 'Short URL: submit an OCSP request (POST).',
        auth: 'Anonymous',
        category: 'Public Short URLs',
        responseDescription: 'OCSP response.',
    },
    {
        method: 'GET',
        path: '/ocsp/{encodedRequest}',
        summary: 'Short URL: submit an OCSP request (GET).',
        auth: 'Anonymous',
        category: 'Public Short URLs',
        responseDescription: 'OCSP response.',
    },
    {
        method: 'POST',
        path: '/tsa',
        summary: 'Short URL: submit a TSA request.',
        auth: 'Anonymous',
        category: 'Public Short URLs',
        responseDescription: 'TSA response.',
    },
];
