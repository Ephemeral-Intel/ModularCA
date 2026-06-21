import type { ApiEndpoint } from '../types';

export const publicEnrollment: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/public/enroll/{token}',
        summary: 'Validate an enrollment token and return its configuration.',
        auth: 'Anonymous',
        category: 'Public Enrollment',
        responseDescription: 'Enrollment token details with allowed operations and profiles.',
    },
    {
        method: 'POST',
        path: '/api/v1/public/enroll/{token}',
        summary: 'Submit an enrollment request using a token.',
        auth: 'Anonymous',
        category: 'Public Enrollment',
        responseDescription: 'Issued certificate or enrollment result.',
    },
    {
        method: 'GET',
        path: '/api/v1/public/enroll/{token}/page',
        summary: 'Serve the enrollment HTML page for browser-based enrollment.',
        auth: 'Anonymous',
        category: 'Public Enrollment',
        responseDescription: 'HTML enrollment page.',
    },
];
