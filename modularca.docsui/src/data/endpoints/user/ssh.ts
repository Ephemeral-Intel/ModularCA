import type { ApiEndpoint } from '../types';

export const userSsh: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/user/ssh/ca-keys',
        summary: 'List SSH CA keys designated as user CAs, filtered to CAs the user has access to.',
        auth: 'Authorize (CaUser)',
        category: 'User SSH',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of SSH CA keys with ID, name, key type, public key, and max validity.',
    },
    {
        method: 'POST',
        path: '/api/v1/user/ssh/sign-user',
        summary: 'Sign the caller\'s SSH public key, producing an SSH user certificate.',
        auth: 'Authorize (CaUser)',
        category: 'User SSH',
        requestBody: [
            { name: 'publicKey', type: 'string', required: true, description: 'User\'s SSH public key to be signed' },
            { name: 'principals', type: 'string[]', required: true, description: 'List of principals (usernames) allowed on the certificate' },
            { name: 'sshRequestProfileId', type: 'guid', required: true, description: 'SSH request profile ID for access validation' },
            { name: 'sshSigningProfileId', type: 'guid', required: false, description: 'Optional SSH signing profile ID; derived from request profile when not specified' },
            { name: 'sshCertProfileId', type: 'guid', required: false, description: 'Optional SSH cert profile ID; derived from request profile when not specified' },
            { name: 'validityHours', type: 'int', required: false, description: 'Optional validity duration in hours' },
            { name: 'keyId', type: 'string', required: false, description: 'Optional key identifier; defaults to the user\'s username' },
            { name: 'extensions', type: 'string[]', required: false, description: 'Optional SSH extensions to include' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Signed SSH certificate with serial, principals, validity, and certificate content.',
    },
    {
        method: 'GET',
        path: '/api/v1/user/ssh/certificates',
        summary: 'List SSH certificates issued by or for the authenticated user.',
        auth: 'Authorize (CaUser)',
        category: 'User SSH',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of SSH certificates with serial, key ID, principals, validity, and revocation status.',
    },
    {
        method: 'GET',
        path: '/api/v1/user/ssh/certificates/{id}/download',
        summary: 'Download a signed SSH certificate owned by the current user.',
        auth: 'Authorize (CaUser)',
        category: 'User SSH',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Signed SSH certificate content as text.',
    },
];
