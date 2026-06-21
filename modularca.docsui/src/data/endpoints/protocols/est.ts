import type { ApiEndpoint } from '../types';

export const est: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/est/{caLabel}/cacerts',
        summary: 'EST: Get CA certificates (RFC 7030 /cacerts).',
        auth: 'Anonymous',
        category: 'EST',
        responseDescription: 'CA certificates in PKCS#7 format.',
    },
    {
        method: 'POST',
        path: '/api/v1/est/{caLabel}/simpleenroll',
        summary: 'EST: Simple enrollment - issue a certificate from a PKCS#10 CSR (RFC 7030).',
        auth: 'EST Client Auth',
        category: 'EST',
        responseDescription: 'Issued certificate in PKCS#7 format.',
    },
    {
        method: 'POST',
        path: '/api/v1/est/{caLabel}/simplereenroll',
        summary: 'EST: Simple re-enrollment - renew a certificate (RFC 7030).',
        auth: 'EST Client Auth',
        category: 'EST',
        responseDescription: 'Re-issued certificate in PKCS#7 format.',
    },
    {
        method: 'GET',
        path: '/api/v1/est/{caLabel}/csrattrs',
        summary: 'EST: Get CSR attributes required by the CA (RFC 7030).',
        auth: 'Anonymous',
        category: 'EST',
        responseDescription: 'CSR attributes in DER format.',
    },
];
