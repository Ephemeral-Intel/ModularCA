import type { ApiEndpoint } from '../types';

export const publicSsh: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/public/ssh/ca-keys',
        summary: 'List all SSH CA public keys.',
        auth: 'Anonymous',
        category: 'Public SSH',
        responseDescription: 'Array of SSH CA keys with ID, name, key type, and public key.',
    },
    {
        method: 'GET',
        path: '/api/v1/public/ssh/ca-keys/{id}/public-key',
        summary: 'Get the public key text for a specific SSH CA key.',
        auth: 'Anonymous',
        category: 'Public SSH',
        responseDescription: 'SSH public key as plain text.',
    },
    {
        method: 'GET',
        path: '/api/v1/public/ssh/ca/{id}/public-key',
        summary: 'Get the public key text for a specific SSH CA key (alternate path).',
        auth: 'Anonymous',
        category: 'Public SSH',
        responseDescription: 'SSH public key as plain text.',
    },
    {
        method: 'GET',
        path: '/api/v1/public/ssh/ca-keys/{id}/krl',
        summary: 'Download the Key Revocation List for an SSH CA key.',
        auth: 'Anonymous',
        category: 'Public SSH',
        responseDescription: 'Binary KRL file.',
    },
];
