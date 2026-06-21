import type { ApiEndpoint } from '../../types';

export const adminSshProfiles: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/ssh/profiles/signing',
        summary: 'List all SSH signing profiles.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of SSH signing profiles.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/ssh/profiles/signing/{id}',
        summary: 'Get an SSH signing profile by ID.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'SSH signing profile details.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/ssh/profiles/signing',
        summary: 'Create a new SSH signing profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Created SSH signing profile.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/ssh/profiles/signing/{id}',
        summary: 'Update an SSH signing profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated SSH signing profile.',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/ssh/profiles/signing/{id}',
        summary: 'Delete an SSH signing profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Deletion confirmation.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/ssh/profiles/cert',
        summary: 'List all SSH certificate profiles.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of SSH certificate profiles.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/ssh/profiles/cert/{id}',
        summary: 'Get an SSH certificate profile by ID.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'SSH certificate profile details.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/ssh/profiles/cert',
        summary: 'Create a new SSH certificate profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Created SSH certificate profile.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/ssh/profiles/cert/{id}',
        summary: 'Update an SSH certificate profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated SSH certificate profile.',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/ssh/profiles/cert/{id}',
        summary: 'Delete an SSH certificate profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Deletion confirmation.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/ssh/profiles/request',
        summary: 'List all SSH request profiles.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of SSH request profiles.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/ssh/profiles/request/{id}',
        summary: 'Get an SSH request profile by ID.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'SSH request profile details.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/ssh/profiles/request',
        summary: 'Create a new SSH request profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Created SSH request profile.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/ssh/profiles/request/{id}',
        summary: 'Update an SSH request profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Updated SSH request profile.',
    },
    {
        method: 'DELETE',
        path: '/api/v1/admin/ssh/profiles/request/{id}',
        summary: 'Delete an SSH request profile.',
        auth: 'Authorize (CaOperator)',
        category: 'Admin SSH Profiles',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Deletion confirmation.',
    },
];
