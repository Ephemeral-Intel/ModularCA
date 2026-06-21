import type { ApiEndpoint } from '../types';

export const stepUp: ApiEndpoint[] = [
    {
        method: 'POST',
        path: '/api/v1/auth/mfa/verify-stepup/totp',
        summary: 'Step-up MFA verification using a TOTP code for sensitive operations.',
        auth: 'Authorize',
        category: 'MFA Step-Up',
        requestBody: [
            { name: 'code', type: 'string', required: true, description: 'The 6-digit TOTP code' },
            { name: 'operation', type: 'string', required: true, description: 'The operation being authorized (e.g., delete-user, revoke-ca)' },
            { name: 'targetId', type: 'string', required: false, description: 'Target entity ID for the operation' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Operation-scoped step-up token valid for 5 minutes.',
    },
    {
        method: 'POST',
        path: '/api/v1/auth/mfa/verify-stepup/webauthn-options',
        summary: 'Get WebAuthn assertion options for step-up verification.',
        auth: 'Authorize',
        category: 'MFA Step-Up',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'PublicKeyCredentialRequestOptions for the browser WebAuthn API.',
    },
    {
        method: 'POST',
        path: '/api/v1/auth/mfa/verify-stepup/webauthn',
        summary: 'Step-up MFA verification using a WebAuthn assertion for sensitive operations.',
        auth: 'Authorize',
        category: 'MFA Step-Up',
        requestBody: [
            { name: 'assertionResponse', type: 'AuthenticatorAssertionRawResponse', required: true, description: 'Raw authenticator assertion response' },
            { name: 'operation', type: 'string', required: true, description: 'The operation being authorized' },
            { name: 'targetId', type: 'string', required: false, description: 'Target entity ID for the operation' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Operation-scoped step-up token valid for 5 minutes.',
    },
    {
        method: 'POST',
        path: '/api/v1/auth/mfa/verify-stepup/mtls',
        summary: 'Restricted mTLS step-up verification. Only allowed for MFA enrollment operations.',
        auth: 'Authorize',
        category: 'MFA Step-Up',
        requestBody: [
            { name: 'operation', type: 'string', required: true, description: 'MFA enrollment operation (e.g., totp-setup, webauthn-register)' },
            { name: 'targetId', type: 'string', required: false, description: 'Target entity ID for the operation' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Operation-scoped step-up token valid for 5 minutes.',
        notes: 'Only allowed for MFA enrollment operations. Cannot be used for destructive operations.',
    },
];
