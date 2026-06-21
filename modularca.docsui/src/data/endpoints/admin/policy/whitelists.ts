import type { ApiEndpoint } from '../../types';

export const adminWhitelists: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/whitelists',
        summary: 'List every whitelist rule, ordered for admin UI display.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Whitelists',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of whitelist rules with id, name, description, scope, certificateAuthorityId, protocol, cidrs, isEnabled, isSystemDefault, createdAt, and updatedAt.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/whitelists/{id}',
        summary: 'Fetch a single whitelist rule by its primary key.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Whitelists',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Whitelist rule details. Returns 404 if not found.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/whitelists',
        summary: 'Create a new whitelist rule. Requires step-up MFA.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Whitelists',
        requestBody: [
            { name: 'name', type: 'string', required: true, description: 'Operator-facing label for the new rule' },
            { name: 'description', type: 'string', required: false, description: 'Free-text description of the rule intent' },
            { name: 'scope', type: 'WhitelistScope', required: true, description: 'Scope bucket: System, Setup, Auth, Api, ShortUrl, Ca, or Protocol' },
            { name: 'certificateAuthorityId', type: 'guid', required: false, description: 'Required for Ca and Protocol scopes' },
            { name: 'protocol', type: 'string', required: false, description: 'Required for Protocol scope (e.g., EST, SCEP, ACME, CMP)' },
            { name: 'cidrs', type: 'string[]', required: true, description: 'List of CIDR ranges (at least one required)' },
            { name: 'isEnabled', type: 'bool', required: false, description: 'Whether the rule is active on insert (default: true)' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-MFA-Token', type: 'string', required: true, description: 'Step-up MFA token (operation: create-whitelist)' },
        ],
        responseDescription: '201 Created with the new whitelist rule.',
        notes: 'Validates scope shape (e.g., Protocol scope requires both CA ID and protocol). CIDR entries are validated. Returns 409 if a rule already exists for the same (Scope, CertificateAuthorityId, Protocol) combination.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/whitelists/{id}',
        summary: 'Update mutable fields on an existing whitelist rule. Requires step-up MFA. Only provided fields are modified.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Whitelists',
        requestBody: [
            { name: 'name', type: 'string', required: false, description: 'New operator-facing label' },
            { name: 'description', type: 'string', required: false, description: 'New description' },
            { name: 'cidrs', type: 'string[]', required: false, description: 'New CIDR list (must contain at least one entry if provided)' },
            { name: 'isEnabled', type: 'bool', required: false, description: 'New enabled flag' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-MFA-Token', type: 'string', required: true, description: 'Step-up MFA token (operation: update-whitelist, targetId: rule ID)' },
        ],
        responseDescription: 'Updated whitelist rule.',
        notes: 'Scope, CertificateAuthorityId, and Protocol are immutable via this endpoint. System-default rules can be edited but not deleted.',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/whitelists/{id}',
        summary: 'Delete a whitelist rule. Requires step-up MFA. System-default rules cannot be deleted.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin Whitelists',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-MFA-Token', type: 'string', required: true, description: 'Step-up MFA token (operation: delete-whitelist, targetId: rule ID)' },
        ],
        responseDescription: '204 No Content on success.',
        notes: 'Returns 409 if the rule is a system default (disable or edit instead). Returns 404 if the rule does not exist.',
    },
];
