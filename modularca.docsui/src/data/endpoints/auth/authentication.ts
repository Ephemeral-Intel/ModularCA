import type { ApiEndpoint } from '../types';

export const authentication: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/auth/login-banner',
        summary: 'Returns the system use notification banner for display on login pages.',
        auth: 'Anonymous',
        category: 'Authentication',
        responseDescription: 'Object with banner (string or null). Returns null when no banner is configured.',
    },
    {
        method: 'POST',
        path: '/api/v1/auth/login',
        summary: 'Authenticate with username and password. Returns JWT tokens or MFA challenge.',
        auth: 'Anonymous',
        category: 'Authentication',
        requestBody: [
            { name: 'username', type: 'string', required: true, description: 'The user\'s login name' },
            { name: 'password', type: 'string', required: true, description: 'The user\'s password' },
        ],
        headers: [
            { name: 'X-CSRF-Token', type: 'string', required: true, description: 'Anti-CSRF token for state-changing anonymous requests' },
        ],
        responseDescription: 'JWT token pair on success, or MFA challenge with temporary mfaToken if MFA is configured.',
        notes: 'CSRF validation required. If MFA is configured, returns requiresMfa: true with an mfaToken and available methods.',
    },
    {
        method: 'POST',
        path: '/api/v1/auth/refresh',
        summary: 'Refresh an expired JWT access token using a valid refresh token.',
        auth: 'Anonymous',
        category: 'Authentication',
        requestBody: [
            { name: 'refreshToken', type: 'string', required: true, description: 'The refresh token from a previous login or refresh' },
        ],
        responseDescription: 'New JWT access token and refresh token pair.',
    },
    {
        method: 'POST',
        path: '/api/v1/auth/change-password',
        summary: 'Pre-JWT password change for users with forced password reset on first login.',
        auth: 'Anonymous',
        category: 'Authentication',
        requestBody: [
            { name: 'username', type: 'string', required: true, description: 'The user\'s login name' },
            { name: 'oldPassword', type: 'string', required: true, description: 'Current password' },
            { name: 'newPassword', type: 'string', required: true, description: 'New password' },
            { name: 'confirmNewPassword', type: 'string', required: true, description: 'New password confirmation' },
        ],
        responseDescription: 'Success message; user must log in again with the new password.',
    },
    {
        method: 'POST',
        path: '/api/v1/auth/logout',
        summary: 'Revoke JWT and all refresh tokens for the current user.',
        auth: 'Authorize',
        category: 'Authentication',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Confirmation that all sessions have been revoked.',
    },
    {
        method: 'POST',
        path: '/api/v1/auth/cert-login',
        summary: 'Authenticate using a client TLS certificate (certificate-based login).',
        auth: 'Anonymous',
        category: 'Authentication',
        responseDescription: 'JWT token pair if the certificate thumbprint matches a registered user.',
        notes: 'Client certificate must be presented at the TLS layer.',
    },
];
