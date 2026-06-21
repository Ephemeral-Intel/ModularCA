import type { ApiEndpoint } from '../../types';

export const adminScheduler: ApiEndpoint[] = [
    {
        method: 'GET',
        path: '/api/v1/admin/scheduler/health',
        summary: 'Returns the current scheduler health, lease holder, and runtime tunables.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Scheduler',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Object with leaseHolder { instanceId, acquiredAtUtc, expiresAtUtc }, pollIntervalSeconds (hardcoded read-only, 30), leaseTtlSeconds, missedRunPolicy, defaultJobTimeoutSeconds, and consecutiveFailureAlertThreshold.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/scheduler/jobs',
        summary: 'Lists all registered scheduler jobs with their cron, last run, and failure state.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Scheduler',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Array of { name, cronExpression, enabled, timeoutSeconds, lastRunUtc, lastResult (success|failed|cancelled|null), lastDurationMs, lastError, consecutiveFailureCount, nextRunUtc }.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/scheduler/jobs/{name}',
        summary: 'Updates a scheduler job\'s cron expression and/or timeout. Validates cron via NCrontab and persists to config.yaml. Requires step-up MFA.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Scheduler',
        requestBody: [
            { name: 'cronExpression', type: 'string', required: false, description: 'NCrontab-compatible cron expression. Validated server-side; rejected if invalid.' },
            { name: 'timeoutSeconds', type: 'integer', required: false, description: 'Per-job execution timeout. Persisted into Scheduler.JobTimeouts dictionary.' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-Step-Up-Token', type: 'string', required: true, description: 'Step-up MFA token scoped to op=update-scheduler-job.' },
        ],
        responseDescription: 'Update confirmation with the refreshed job entry. Audit event: SchedulerJobUpdated.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/scheduler/jobs/{name}/run',
        summary: 'Triggers a manual fire-and-forget run of the named scheduler job. Requires step-up MFA.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Scheduler',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-Step-Up-Token', type: 'string', required: true, description: 'Step-up MFA token scoped to op=run-scheduler-job.' },
        ],
        responseDescription: '202 Accepted; the job runs asynchronously. Audit event: SchedulerJobManualRun.',
    },
    {
        method: 'GET',
        path: '/api/v1/admin/scheduler/schedules',
        summary: 'Returns the aggregated CRL and LDAP publishing schedules with computed cadence info.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Scheduler',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
        ],
        responseDescription: 'Object { crl: [...], ldap: [...] } aggregating CrlConfigurations and LdapConfigurations rows with their cadence info.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/scheduler/schedules/crl/{taskId}/run',
        summary: 'Triggers a manual fire-and-forget run of the named CRL publishing task. Requires step-up MFA.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Scheduler',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-Step-Up-Token', type: 'string', required: true, description: 'Step-up MFA token scoped to op=run-scheduler-schedule.' },
        ],
        responseDescription: '202 Accepted; the CRL task runs asynchronously. Audit event: SchedulerScheduleManualRun.',
    },
    {
        method: 'POST',
        path: '/api/v1/admin/scheduler/schedules/ldap/{id}/run',
        summary: 'Triggers a manual fire-and-forget run of the named LDAP publishing task. Requires step-up MFA.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Scheduler',
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-Step-Up-Token', type: 'string', required: true, description: 'Step-up MFA token scoped to op=run-scheduler-schedule.' },
        ],
        responseDescription: '202 Accepted; the LDAP task runs asynchronously. Audit event: SchedulerScheduleManualRun.',
    },
    {
        method: 'PUT',
        path: '/api/v1/admin/scheduler/config',
        summary: 'Updates global scheduler runtime tunables (lease TTL, missed-run policy, default timeout, failure alert threshold). Requires step-up MFA. Note: Scheduler.Enabled and Scheduler.PollIntervalSeconds are hardcoded constants and not accepted here.',
        auth: 'Authorize (SystemOperator)',
        category: 'Admin Scheduler',
        requestBody: [
            { name: 'leaseTtlSeconds', type: 'integer', required: false, description: 'Lease TTL in seconds. Must be >= 15.' },
            { name: 'missedRunPolicy', type: 'string', required: false, description: 'One of SkipMissed, RunOnce, RunAll.' },
            { name: 'defaultJobTimeoutSeconds', type: 'integer', required: false, description: 'Fallback per-job timeout when a job-specific override is not set.' },
            { name: 'consecutiveFailureAlertThreshold', type: 'integer', required: false, description: 'Number of consecutive job failures before an alert fires.' },
        ],
        headers: [
            { name: 'Authorization', type: 'Bearer token', required: true, description: 'JWT access token from /api/v1/auth/login' },
            { name: 'X-Step-Up-Token', type: 'string', required: true, description: 'Step-up MFA token scoped to op=update-scheduler-config.' },
        ],
        responseDescription: 'Update confirmation with the refreshed scheduler config. Audit event: SchedulerConfigUpdated.',
    },
];
