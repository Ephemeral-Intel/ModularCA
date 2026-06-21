import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import ConfirmModal from '../components/ConfirmModal';
import {
    type CrlScheduleEntry,
    type LdapPublisherEntry,
    type SchedulerConfigUpdate,
    type SchedulerHealth,
    type SchedulerJob,
    type SchedulerJobUpdate,
    type SchedulerSchedules,
    deleteCrlSchedule,
    deleteLdapPublisher,
    getSchedulerHealth,
    getSchedulerJobs,
    getSchedulerSchedules,
    runCrlSchedule,
    runLdapSchedule,
    runSchedulerJob,
    setSchedulerJobEnabled,
    updateCrlSchedule,
    updateLdapPublisher,
    updateSchedulerConfig,
    updateSchedulerJob,
} from '../api/scheduler';

// ---------------------------------------------------------------------------
// Style helpers (match Settings/Vulnerabilities/BackupRestore conventions)
// ---------------------------------------------------------------------------

const cardClass = 'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg';
const inputClass = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500';
const labelClass = 'block text-xs text-gray-600 dark:text-gray-400 mb-1';
const smallButton = 'px-3 py-1 text-xs rounded border transition-colors';
const primaryButton = 'px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50';

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatAbsoluteUtc(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toISOString();
}

function formatRelative(iso: string | null | undefined, now: number): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const deltaMs = d.getTime() - now;
    const future = deltaMs >= 0;
    const abs = Math.abs(deltaMs);
    const sec = Math.floor(abs / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);

    let unit: string;
    let value: number;
    if (sec < 60) { unit = 'second'; value = sec; }
    else if (min < 60) { unit = 'minute'; value = min; }
    else if (hr < 24) { unit = 'hour'; value = hr; }
    else { unit = 'day'; value = day; }

    const plural = value === 1 ? '' : 's';
    return future ? `in ${value} ${unit}${plural}` : `${value} ${unit}${plural} ago`;
}

const TimeCell: React.FC<{ iso: string | null | undefined; now: number }> = ({ iso, now }) => (
    <span className="text-xs text-gray-700 dark:text-gray-300" title={formatAbsoluteUtc(iso) || 'never'}>
        {formatRelative(iso, now)}
    </span>
);

// ---------------------------------------------------------------------------
// Cron validation (basic — server is authoritative via NCrontab)
// ---------------------------------------------------------------------------

const CRON_5_FIELD = /^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*$/;
function isCronShapeValid(expr: string): boolean {
    return CRON_5_FIELD.test(expr);
}

// ---------------------------------------------------------------------------
// Health Strip
// ---------------------------------------------------------------------------

const HealthStrip: React.FC<{ health: SchedulerHealth | null; now: number }> = ({ health, now }) => {
    if (!health) {
        return (
            <div className={`${cardClass} p-4 text-sm text-gray-600 dark:text-gray-400`}>Loading scheduler health...</div>
        );
    }

    const lease = health.leaseHolder;
    const expiresIn = lease ? formatRelative(lease.expiresAtUtc, now) : 'no active lease';
    const instanceShort = lease ? lease.instanceId.slice(0, 12) : '-';

    const tile = (label: string, value: React.ReactNode, title?: string) => (
        <div className="flex flex-col gap-0.5 px-4 py-3 border-r border-gray-300 dark:border-gray-700 last:border-r-0 min-w-[150px]">
            <span className="text-[10px] uppercase tracking-wide text-gray-600 dark:text-gray-400">{label}</span>
            <span className="text-sm text-gray-900 dark:text-white" title={title}>{value}</span>
        </div>
    );

    return (
        <div className={`${cardClass} flex flex-wrap items-stretch overflow-hidden`}>
            {tile(
                'Lease Holder',
                <span className="font-mono">{instanceShort}{lease && lease.instanceId.length > 12 ? '...' : ''}</span>,
                lease?.instanceId,
            )}
            {tile('Lease Expires', expiresIn, lease ? formatAbsoluteUtc(lease.expiresAtUtc) : undefined)}
            {tile('Poll Interval', `${health.pollIntervalSeconds}s, fixed`)}
            {tile('Missed-Run Policy', health.missedRunPolicy || '-')}
            {tile('Default Timeout', `${health.defaultJobTimeoutSeconds}s`)}
            {tile('Failure Alert Threshold', health.consecutiveFailureAlertThreshold)}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Job Edit Modal
// ---------------------------------------------------------------------------

interface JobEditModalProps {
    job: SchedulerJob | null;
    onClose: () => void;
    onSaved: () => void;
}

const JobEditModal: React.FC<JobEditModalProps> = ({ job, onClose, onSaved }) => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [cron, setCron] = useState('');
    const [timeout, setTimeoutVal] = useState('');
    const [saving, setSaving] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    useEffect(() => {
        if (job) {
            setCron(job.cronExpression || '');
            setTimeoutVal(String(job.timeoutSeconds ?? ''));
            setServerError(null);
        }
    }, [job]);

    if (!job) return null;

    const cronShapeOk = isCronShapeValid(cron);
    const timeoutNum = parseInt(timeout, 10);
    const timeoutOk = !timeout || (Number.isFinite(timeoutNum) && timeoutNum > 0);
    const canSave = cronShapeOk && timeoutOk && !saving;

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setServerError(null);
        const body: SchedulerJobUpdate = {};
        if (cron && cron !== job.cronExpression) body.cronExpression = cron;
        if (timeout && timeoutNum !== job.timeoutSeconds) body.timeoutSeconds = timeoutNum;
        try {
            await updateSchedulerJob(job.name, body, requireStepUp);
            showToast('success', `Updated ${job.name}`);
            onSaved();
            onClose();
        } catch (err: any) {
            if (err?.message === 'Step-up MFA cancelled') return;
            setServerError(err?.message || 'Failed to update job');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Edit Job: {job.name}</h3>
                <div>
                    <label className={labelClass}>Cron Expression</label>
                    <input
                        type="text"
                        value={cron}
                        onChange={(e) => setCron(e.target.value)}
                        placeholder="e.g. 0 */6 * * *"
                        className={`${inputClass} font-mono`}
                    />
                    {!cronShapeOk && cron.length > 0 && (
                        <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">
                            Must be 5 space-separated fields (minute, hour, day, month, day-of-week).
                        </p>
                    )}
                </div>
                <div>
                    <label className={labelClass}>Timeout (seconds)</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={timeout}
                        onChange={(e) => setTimeoutVal(e.target.value.replace(/\D/g, ''))}
                        className={inputClass}
                    />
                    {!timeoutOk && (
                        <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">Timeout must be a positive integer.</p>
                    )}
                </div>
                {serverError && (
                    <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-xs text-red-800 dark:text-red-300">
                        {serverError}
                    </div>
                )}
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} disabled={saving}
                        className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={!canSave} className={primaryButton}>
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// System Jobs Section
// ---------------------------------------------------------------------------

// Continuous-throttle jobs (always-on, internally rate-limited). The backend
// returns 400 if the operator tries to disable these — surface the disabled
// toggle button proactively instead of letting the round-trip fail.
const NON_TOGGLEABLE_JOBS = new Set<string>(['AcmeCleanup', 'TlsRenewal']);

function jobResultBadge(result: SchedulerJob['lastResult']): React.ReactElement {
    if (result === 'success') return <StatusBadge status="active" label="success" />;
    if (result === 'failed') return <StatusBadge status="revoked" label="failed" />;
    if (result === 'cancelled') return <StatusBadge status="held" label="cancelled" />;
    return <StatusBadge status="disabled" label="never run" />;
}

interface SystemJobsSectionProps {
    jobs: SchedulerJob[];
    health: SchedulerHealth | null;
    now: number;
    onChanged: () => void;
}

const SystemJobsSection: React.FC<SystemJobsSectionProps> = ({ jobs, health, now, onChanged }) => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [editingJob, setEditingJob] = useState<SchedulerJob | null>(null);
    const [confirmRunJob, setConfirmRunJob] = useState<SchedulerJob | null>(null);
    const [running, setRunning] = useState<string | null>(null);
    const [togglingFlag, setTogglingFlag] = useState<string | null>(null);

    const alertThreshold = health?.consecutiveFailureAlertThreshold ?? Number.MAX_SAFE_INTEGER;

    const handleRun = async (job: SchedulerJob) => {
        setRunning(job.name);
        try {
            await runSchedulerJob(job.name, requireStepUp);
            showToast('success', `Triggered ${job.name}`);
            onChanged();
        } catch (err: any) {
            if (err?.message === 'Step-up MFA cancelled') return;
            showToast('error', err?.message || 'Failed to trigger job');
        } finally {
            setRunning(null);
            setConfirmRunJob(null);
        }
    };

    const handleToggleFlag = async (job: SchedulerJob) => {
        if (NON_TOGGLEABLE_JOBS.has(job.name)) {
            showToast('error', `${job.name} is a continuous job and cannot be disabled.`);
            return;
        }
        setTogglingFlag(job.name);
        try {
            // Toggles the SystemConfig boolean that gates this job (e.g.
            // Backup.CreateOnSchedule, AutoRenewal.Enabled). Step-up MFA gated
            // because it changes scheduler behavior on the next tick.
            await setSchedulerJobEnabled(job.name, !job.enabled, requireStepUp);
            showToast('success', `${job.name} ${job.enabled ? 'disabled' : 'enabled'}`);
            onChanged();
        } catch (err: any) {
            if (err?.message === 'Step-up MFA cancelled') return;
            showToast('error', err?.message || 'Failed to toggle job');
        } finally {
            setTogglingFlag(null);
        }
    };

    return (
        <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">System Jobs</h2>
            <div className={`${cardClass} overflow-x-auto`}>
                <table className="w-full text-sm">
                    <thead className="bg-gray-200/50 dark:bg-gray-700/50 text-left">
                        <tr>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Name</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Cron</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Last Run</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Next Run</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Failures</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Timeout</th>
                            <th className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.length === 0 && (
                            <tr><td colSpan={7} className="px-3 py-6 text-center text-xs text-gray-600 dark:text-gray-400">No system jobs registered.</td></tr>
                        )}
                        {jobs.map((job) => {
                            const canToggle = !NON_TOGGLEABLE_JOBS.has(job.name);
                            const failuresOver = job.consecutiveFailureCount >= alertThreshold;
                            return (
                                <tr key={job.name} className="border-t border-gray-300 dark:border-gray-700">
                                    <td className="px-3 py-2 text-gray-900 dark:text-white">
                                        <div className="flex items-center gap-2">
                                            <span>{job.name}</span>
                                            <StatusBadge status={job.enabled ? 'enabled' : 'disabled'} />
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{job.cronExpression}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <TimeCell iso={job.lastRunUtc} now={now} />
                                            {jobResultBadge(job.lastResult)}
                                        </div>
                                        {job.lastError && (
                                            <div className="text-[10px] text-red-700 dark:text-red-400 mt-0.5 max-w-xs truncate" title={job.lastError}>
                                                {job.lastError}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2"><TimeCell iso={job.nextRunUtc} now={now} /></td>
                                    <td className="px-3 py-2">
                                        <span className={`inline-block px-2 py-0.5 text-xs rounded border ${failuresOver
                                            ? 'bg-red-50 text-red-800 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700'
                                            : 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600'}`}>
                                            {job.consecutiveFailureCount}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{job.timeoutSeconds}s</td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="inline-flex gap-1.5">
                                            <button
                                                onClick={() => setEditingJob(job)}
                                                className={`${smallButton} bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900`}>
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => setConfirmRunJob(job)}
                                                disabled={running === job.name}
                                                className={`${smallButton} bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900 disabled:opacity-50`}>
                                                {running === job.name ? 'Running...' : 'Run Now'}
                                            </button>
                                            {canToggle && (
                                                <button
                                                    onClick={() => handleToggleFlag(job)}
                                                    disabled={togglingFlag === job.name}
                                                    className={`${smallButton} ${job.enabled
                                                        ? 'bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-100 dark:hover:bg-yellow-900'
                                                        : 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'} disabled:opacity-50`}>
                                                    {job.enabled ? 'Disable' : 'Enable'}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <JobEditModal
                job={editingJob}
                onClose={() => setEditingJob(null)}
                onSaved={onChanged}
            />

            <ConfirmModal
                isOpen={!!confirmRunJob}
                title="Run Job Now?"
                message={confirmRunJob ? `Trigger "${confirmRunJob.name}" out-of-band? It will run on the lease holder at the next poll tick.` : ''}
                confirmLabel="Run"
                confirmClass="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                loading={!!running}
                onConfirm={() => confirmRunJob && handleRun(confirmRunJob)}
                onCancel={() => setConfirmRunJob(null)}
            />
        </section>
    );
};

// ---------------------------------------------------------------------------
// CRL Edit Modal
// ---------------------------------------------------------------------------

const CrlEditModal: React.FC<{ entry: CrlScheduleEntry | null; onClose: () => void; onSaved: () => void; }> = ({ entry, onClose, onSaved }) => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [updateInterval, setUpdateInterval] = useState('');
    const [deltaInterval, setDeltaInterval] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (entry) {
            setUpdateInterval(entry.updateInterval || '');
            setDeltaInterval(entry.deltaInterval || '');
            setError(null);
        }
    }, [entry]);

    if (!entry) return null;
    const updateOk = isCronShapeValid(updateInterval);
    const deltaOk = !deltaInterval || isCronShapeValid(deltaInterval);
    const canSave = updateOk && deltaOk && !saving;

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await updateCrlSchedule(entry.taskId, {
                updateInterval,
                deltaInterval: deltaInterval || null,
                isDelta: entry.isDelta,
            }, requireStepUp);
            showToast('success', `Updated CRL schedule "${entry.name}"`);
            onSaved();
            onClose();
        } catch (err: any) {
            if (err?.message === 'Step-up MFA cancelled') return;
            setError(err?.message || 'Failed to update CRL schedule');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Edit CRL Schedule</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">{entry.caLabel} &middot; {entry.name}</p>
                <div>
                    <label className={labelClass}>Update Interval (cron)</label>
                    <input type="text" value={updateInterval} onChange={(e) => setUpdateInterval(e.target.value)}
                        placeholder="0 */6 * * *" className={`${inputClass} font-mono`} />
                    {!updateOk && updateInterval.length > 0 && (
                        <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">Must be 5 space-separated fields.</p>
                    )}
                </div>
                <div>
                    <label className={labelClass}>Delta Interval (cron, optional)</label>
                    <input type="text" value={deltaInterval} onChange={(e) => setDeltaInterval(e.target.value)}
                        placeholder="0 * * * *" className={`${inputClass} font-mono`} />
                    {!deltaOk && (
                        <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">Must be 5 space-separated fields.</p>
                    )}
                </div>
                {error && <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-xs text-red-800 dark:text-red-300">{error}</div>}
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} disabled={saving}
                        className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                    <button onClick={handleSave} disabled={!canSave} className={primaryButton}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// LDAP Edit Modal
// ---------------------------------------------------------------------------

const LdapEditModal: React.FC<{ entry: LdapPublisherEntry | null; onClose: () => void; onSaved: () => void; }> = ({ entry, onClose, onSaved }) => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [updateInterval, setUpdateInterval] = useState('');
    const [host, setHost] = useState('');
    const [port, setPort] = useState('');
    const [baseDn, setBaseDn] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (entry) {
            setUpdateInterval(entry.updateInterval || '');
            setHost(entry.host || '');
            setPort(String(entry.port ?? ''));
            setBaseDn(entry.baseDn || '');
            setError(null);
        }
    }, [entry]);

    if (!entry) return null;
    const portNum = parseInt(port, 10);
    const portOk = Number.isFinite(portNum) && portNum > 0 && portNum < 65536;
    const cronOk = isCronShapeValid(updateInterval);
    const canSave = portOk && cronOk && !saving;

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await updateLdapPublisher(entry.id, {
                host,
                port: portNum,
                baseDn,
                updateInterval,
            }, requireStepUp);
            showToast('success', `Updated LDAP publisher (${entry.host})`);
            onSaved();
            onClose();
        } catch (err: any) {
            if (err?.message === 'Step-up MFA cancelled') return;
            setError(err?.message || 'Failed to update LDAP publisher');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Edit LDAP Publisher</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400">{entry.caLabel}</p>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={labelClass}>Host</label>
                        <input type="text" value={host} onChange={(e) => setHost(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Port</label>
                        <input type="text" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} className={inputClass} />
                        {!portOk && <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">Port must be 1-65535.</p>}
                    </div>
                </div>
                <div>
                    <label className={labelClass}>Base DN</label>
                    <input type="text" value={baseDn} onChange={(e) => setBaseDn(e.target.value)} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Update Interval (cron)</label>
                    <input type="text" value={updateInterval} onChange={(e) => setUpdateInterval(e.target.value)}
                        placeholder="0 */6 * * *" className={`${inputClass} font-mono`} />
                    {!cronOk && updateInterval.length > 0 && (
                        <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">Must be 5 space-separated fields.</p>
                    )}
                </div>
                {error && <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-xs text-red-800 dark:text-red-300">{error}</div>}
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} disabled={saving}
                        className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                    <button onClick={handleSave} disabled={!canSave} className={primaryButton}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Schedules Section (CRL + LDAP, grouped by CA)
// ---------------------------------------------------------------------------

interface SchedulesSectionProps {
    schedules: SchedulerSchedules | null;
    now: number;
    onChanged: () => void;
}

const SchedulesSection: React.FC<SchedulesSectionProps> = ({ schedules, now, onChanged }) => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [collapsedCas, setCollapsedCas] = useState<Record<string, boolean>>({});
    const [editingCrl, setEditingCrl] = useState<CrlScheduleEntry | null>(null);
    const [editingLdap, setEditingLdap] = useState<LdapPublisherEntry | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; action: () => Promise<void> } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    const grouped = useMemo(() => {
        const map = new Map<string, { caLabel: string; crl: CrlScheduleEntry[]; ldap: LdapPublisherEntry[] }>();
        const ensure = (key: string, label: string) => {
            if (!map.has(key)) map.set(key, { caLabel: label, crl: [], ldap: [] });
            return map.get(key)!;
        };
        if (schedules) {
            for (const c of schedules.crl) ensure(c.caCertificateId || c.caLabel, c.caLabel || 'Unknown CA').crl.push(c);
            for (const l of schedules.ldap) ensure(l.certificateAuthorityId || l.caLabel, l.caLabel || 'Unknown CA').ldap.push(l);
        }
        return Array.from(map.entries()).sort((a, b) => a[1].caLabel.localeCompare(b[1].caLabel));
    }, [schedules]);

    const toggleCa = (key: string) => setCollapsedCas((p) => ({ ...p, [key]: !p[key] }));

    const handleRunCrl = async (entry: CrlScheduleEntry) => {
        try {
            await runCrlSchedule(entry.taskId, requireStepUp);
            showToast('success', `Triggered CRL "${entry.name}"`);
            onChanged();
        } catch (err: any) {
            if (err?.message === 'Step-up MFA cancelled') return;
            showToast('error', err?.message || 'Failed to trigger CRL run');
        }
    };

    const handleRunLdap = async (entry: LdapPublisherEntry) => {
        try {
            await runLdapSchedule(entry.id, requireStepUp);
            showToast('success', `Triggered LDAP publish (${entry.host})`);
            onChanged();
        } catch (err: any) {
            if (err?.message === 'Step-up MFA cancelled') return;
            showToast('error', err?.message || 'Failed to trigger LDAP publish');
        }
    };

    const askDeleteCrl = (entry: CrlScheduleEntry) => setConfirmAction({
        title: 'Delete CRL Schedule',
        message: `Delete "${entry.name}" for ${entry.caLabel}? Relying parties that fetch this CRL will fall back to whatever distribution point they have cached until another schedule is created.`,
        confirmLabel: 'Delete',
        action: async () => {
            await deleteCrlSchedule(entry.taskId, requireStepUp);
            showToast('success', `Deleted CRL schedule "${entry.name}"`);
            onChanged();
        },
    });

    const askDeleteLdap = (entry: LdapPublisherEntry) => setConfirmAction({
        title: 'Delete LDAP Publisher',
        message: `Delete LDAP publisher ${entry.host}:${entry.port} for ${entry.caLabel}? CRL/cert publications to this directory will stop until a new publisher is configured.`,
        confirmLabel: 'Delete',
        action: async () => {
            await deleteLdapPublisher(entry.id, requireStepUp);
            showToast('success', `Deleted LDAP publisher (${entry.host})`);
            onChanged();
        },
    });

    return (
        <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Schedules</h2>
            {!schedules && <div className={`${cardClass} p-4 text-sm text-gray-600 dark:text-gray-400`}>Loading schedules...</div>}
            {schedules && grouped.length === 0 && (
                <div className={`${cardClass} p-4 text-sm text-gray-600 dark:text-gray-400`}>No CRL or LDAP schedules configured.</div>
            )}

            {grouped.map(([key, group]) => {
                const collapsed = !!collapsedCas[key];
                return (
                    <div key={key} className={cardClass}>
                        <button onClick={() => toggleCa(key)}
                            className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors">
                            <span className="text-gray-600 text-xs">{collapsed ? '▶' : '▼'}</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{group.caLabel}</span>
                            <span className="text-xs text-gray-600 dark:text-gray-400 ml-2">
                                {group.crl.length} CRL &middot; {group.ldap.length} LDAP
                            </span>
                        </button>
                        {!collapsed && (
                            <div className="border-t border-gray-300 dark:border-gray-700">
                                {/* CRL sub-table */}
                                <div className="p-3 space-y-2">
                                    <h3 className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400 tracking-wide">CRL Schedules</h3>
                                    {group.crl.length === 0 && <div className="text-xs text-gray-600 dark:text-gray-400">None.</div>}
                                    {group.crl.length > 0 && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead className="text-left text-gray-600 dark:text-gray-400">
                                                    <tr>
                                                        <th className="px-2 py-1">Name</th>
                                                        <th className="px-2 py-1">Update</th>
                                                        <th className="px-2 py-1">Delta</th>
                                                        <th className="px-2 py-1">Last</th>
                                                        <th className="px-2 py-1">Next</th>
                                                        <th className="px-2 py-1">Status</th>
                                                        <th className="px-2 py-1 text-right">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.crl.map((c) => (
                                                        <tr key={c.taskId} className="border-t border-gray-300 dark:border-gray-700">
                                                            <td className="px-2 py-1.5 text-gray-900 dark:text-white">{c.name}</td>
                                                            <td className="px-2 py-1.5 font-mono">{c.updateInterval}</td>
                                                            <td className="px-2 py-1.5 font-mono">{c.deltaInterval || '-'}</td>
                                                            <td className="px-2 py-1.5"><TimeCell iso={c.lastGenerated || c.lastUpdatedUtc} now={now} /></td>
                                                            <td className="px-2 py-1.5"><TimeCell iso={c.nextUpdateUtc} now={now} /></td>
                                                            <td className="px-2 py-1.5"><StatusBadge status={c.enabled ? 'enabled' : 'disabled'} /></td>
                                                            <td className="px-2 py-1.5 text-right">
                                                                <div className="inline-flex gap-1">
                                                                    <button onClick={() => setEditingCrl(c)}
                                                                        className={`${smallButton} bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900`}>Edit</button>
                                                                    <button onClick={() => handleRunCrl(c)}
                                                                        className={`${smallButton} bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900`}>Run Now</button>
                                                                    <button onClick={() => askDeleteCrl(c)}
                                                                        className={`${smallButton} bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900`}>Delete</button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* LDAP sub-table */}
                                <div className="p-3 space-y-2 border-t border-gray-300 dark:border-gray-700">
                                    <h3 className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-400 tracking-wide">LDAP Publishers</h3>
                                    {group.ldap.length === 0 && <div className="text-xs text-gray-600 dark:text-gray-400">None.</div>}
                                    {group.ldap.length > 0 && (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead className="text-left text-gray-600 dark:text-gray-400">
                                                    <tr>
                                                        <th className="px-2 py-1">Host</th>
                                                        <th className="px-2 py-1">Base DN</th>
                                                        <th className="px-2 py-1">Update</th>
                                                        <th className="px-2 py-1">Last</th>
                                                        <th className="px-2 py-1">Next</th>
                                                        <th className="px-2 py-1">Publishes</th>
                                                        <th className="px-2 py-1">Status</th>
                                                        <th className="px-2 py-1 text-right">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.ldap.map((l) => {
                                                        const flags = [
                                                            l.publishCACert ? 'CA' : null,
                                                            l.publishCRL ? 'CRL' : null,
                                                            l.publishDelta ? 'Δ' : null,
                                                            l.publishUserCerts ? 'Users' : null,
                                                        ].filter(Boolean).join(', ');
                                                        return (
                                                            <tr key={l.id} className="border-t border-gray-300 dark:border-gray-700">
                                                                <td className="px-2 py-1.5 text-gray-900 dark:text-white">{l.host}:{l.port}</td>
                                                                <td className="px-2 py-1.5 font-mono">{l.baseDn}</td>
                                                                <td className="px-2 py-1.5 font-mono">{l.updateInterval}</td>
                                                                <td className="px-2 py-1.5"><TimeCell iso={l.lastUpdatedUtc} now={now} /></td>
                                                                <td className="px-2 py-1.5"><TimeCell iso={l.nextUpdateUtc} now={now} /></td>
                                                                <td className="px-2 py-1.5">{flags || '-'}</td>
                                                                <td className="px-2 py-1.5"><StatusBadge status={l.enabled ? 'enabled' : 'disabled'} /></td>
                                                                <td className="px-2 py-1.5 text-right">
                                                                    <div className="inline-flex gap-1">
                                                                        <button onClick={() => setEditingLdap(l)}
                                                                            className={`${smallButton} bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900`}>Edit</button>
                                                                        <button onClick={() => handleRunLdap(l)}
                                                                            className={`${smallButton} bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900`}>Run Now</button>
                                                                        <button onClick={() => askDeleteLdap(l)}
                                                                            className={`${smallButton} bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900`}>Delete</button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            <CrlEditModal entry={editingCrl} onClose={() => setEditingCrl(null)} onSaved={onChanged} />
            <LdapEditModal entry={editingLdap} onClose={() => setEditingLdap(null)} onSaved={onChanged} />

            <ConfirmModal
                isOpen={!!confirmAction}
                title={confirmAction?.title || ''}
                message={confirmAction?.message || ''}
                confirmLabel={confirmAction?.confirmLabel || 'Confirm'}
                loading={confirmLoading}
                onConfirm={async () => {
                    if (!confirmAction) return;
                    setConfirmLoading(true);
                    try {
                        await confirmAction.action();
                    } catch (err: any) {
                        if (err?.message !== 'Step-up MFA cancelled') {
                            showToast('error', err?.message || 'Operation failed');
                        }
                    } finally {
                        setConfirmLoading(false);
                        setConfirmAction(null);
                    }
                }}
                onCancel={() => setConfirmAction(null)}
            />
        </section>
    );
};

// ---------------------------------------------------------------------------
// Scheduler Config Section
// ---------------------------------------------------------------------------

const MISSED_RUN_POLICIES = ['SkipMissed', 'RunOnce', 'RunAll'];

const SchedulerConfigSection: React.FC<{ health: SchedulerHealth | null; onChanged: () => void }> = ({ health, onChanged }) => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [leaseTtl, setLeaseTtl] = useState('');
    const [policy, setPolicy] = useState('SkipMissed');
    const [defaultTimeout, setDefaultTimeout] = useState('');
    const [alertThreshold, setAlertThreshold] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (health) {
            setLeaseTtl(String(health.leaseTtlSeconds ?? ''));
            setPolicy(health.missedRunPolicy || 'SkipMissed');
            setDefaultTimeout(String(health.defaultJobTimeoutSeconds ?? ''));
            setAlertThreshold(String(health.consecutiveFailureAlertThreshold ?? ''));
        }
    }, [health]);

    const leaseTtlNum = parseInt(leaseTtl, 10);
    const timeoutNum = parseInt(defaultTimeout, 10);
    const thresholdNum = parseInt(alertThreshold, 10);
    const leaseTtlOk = Number.isFinite(leaseTtlNum) && leaseTtlNum >= 15;
    const timeoutOk = Number.isFinite(timeoutNum) && timeoutNum > 0;
    const thresholdOk = Number.isFinite(thresholdNum) && thresholdNum >= 1;
    const canSave = leaseTtlOk && timeoutOk && thresholdOk && !saving;

    const handleSave = async () => {
        setSaving(true);
        const body: SchedulerConfigUpdate = {
            leaseTtlSeconds: leaseTtlNum,
            missedRunPolicy: policy,
            defaultJobTimeoutSeconds: timeoutNum,
            consecutiveFailureAlertThreshold: thresholdNum,
        };
        try {
            await updateSchedulerConfig(body, requireStepUp);
            showToast('success', 'Scheduler config saved');
            onChanged();
        } catch (err: any) {
            if (err?.message === 'Step-up MFA cancelled') return;
            showToast('error', err?.message || 'Failed to save config');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scheduler Config</h2>
            <div className={`${cardClass} p-4 space-y-4`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Lease TTL (seconds, min 15)</label>
                        <input type="text" inputMode="numeric" value={leaseTtl}
                            onChange={(e) => setLeaseTtl(e.target.value.replace(/\D/g, ''))} className={inputClass} />
                        {!leaseTtlOk && <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">Must be at least 15 seconds.</p>}
                    </div>
                    <div>
                        <label className={labelClass}>Missed-Run Policy</label>
                        <select value={policy} onChange={(e) => setPolicy(e.target.value)} className={inputClass}>
                            {MISSED_RUN_POLICIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Default Job Timeout (seconds)</label>
                        <input type="text" inputMode="numeric" value={defaultTimeout}
                            onChange={(e) => setDefaultTimeout(e.target.value.replace(/\D/g, ''))} className={inputClass} />
                        {!timeoutOk && <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">Must be a positive integer.</p>}
                    </div>
                    <div>
                        <label className={labelClass}>Consecutive Failure Alert Threshold</label>
                        <input type="text" inputMode="numeric" value={alertThreshold}
                            onChange={(e) => setAlertThreshold(e.target.value.replace(/\D/g, ''))} className={inputClass} />
                        {!thresholdOk && <p className="text-[10px] text-red-700 dark:text-red-400 mt-1">Must be at least 1.</p>}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60 pointer-events-none">
                    <div>
                        <label className={labelClass}>Enabled (read-only)</label>
                        <input type="text" value="true" disabled className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Poll Interval (read-only)</label>
                        <input type="text" value={`${health?.pollIntervalSeconds ?? 30}s`} disabled className={inputClass} />
                    </div>
                </div>

                <div className="flex justify-end">
                    <button onClick={handleSave} disabled={!canSave} className={primaryButton}>
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </section>
    );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const Schedules: React.FC = () => {
    const { showToast } = useToast();
    const [health, setHealth] = useState<SchedulerHealth | null>(null);
    const [jobs, setJobs] = useState<SchedulerJob[]>([]);
    const [schedules, setSchedules] = useState<SchedulerSchedules | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState<number>(Date.now());

    const reload = useCallback(async () => {
        setError(null);
        try {
            const [h, j, s] = await Promise.all([
                getSchedulerHealth(),
                getSchedulerJobs(),
                getSchedulerSchedules(),
            ]);
            setHealth(h);
            setJobs(j);
            setSchedules(s);
        } catch (err: any) {
            setError(err?.message || 'Failed to load scheduler data');
            showToast('error', err?.message || 'Failed to load scheduler data');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        reload();
    }, [reload]);

    // Tick the relative-time clock every second so the "expires in" countdown
    // and "in N minutes" labels stay live without re-fetching.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="p-3 sm:p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Schedules</h1>
                <button onClick={reload} disabled={loading}
                    className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50">
                    {loading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-800 dark:text-red-300">
                    {error}
                </div>
            )}

            <HealthStrip health={health} now={now} />
            <SystemJobsSection jobs={jobs} health={health} now={now} onChanged={reload} />
            <SchedulesSection schedules={schedules} now={now} onChanged={reload} />
            <SchedulerConfigSection health={health} onChanged={reload} />
        </div>
    );
};

export default Schedules;
