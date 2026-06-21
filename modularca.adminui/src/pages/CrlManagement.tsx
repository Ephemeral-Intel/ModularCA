import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, API_BASE } from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import ConfirmModal from '../components/ConfirmModal';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ─── CRL Schedules Section ─── */
const CrlSchedulesSection: React.FC = () => {
    const { showToast } = useToast();
    const [schedules, setSchedules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [cas, setCas] = useState<any[]>([]);
    // Confirm modal state
    const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; title: string; message: string } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);
    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ updateInterval: '', overlapPeriod: '', deltaInterval: '', description: '' });
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        name: '',
        cronExpression: '',
        caId: '',
        overlapPeriod: '',
    });

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/crl-schedules')
            .then((data) => setSchedules(Array.isArray(data) ? data : (data.items || data.schedules || [])))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        apiGet<any>('/api/v1/admin/authorities')
            .then((data) => setCas(Array.isArray(data) ? data : (data.items || data.authorities || [])))
            .catch(() => {});
    }, []);

    const handleCreate = async () => {
        setCreating(true);
        try {
            await apiPost('/api/v1/admin/crl-schedules', form);
            setShowCreate(false);
            setForm({ name: '', cronExpression: '', caId: '', overlapPeriod: '' });
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create schedule');
        } finally {
            setCreating(false);
        }
    };

    const handleToggle = async (schedule: any) => {
        try {
            await apiPut(`/api/v1/admin/crl-schedules/${schedule.id || schedule.scheduleId}/status`, {
                enabled: !schedule.enabled,
            });
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to update schedule status');
        }
    };

    /// <summary>
    /// Prompts for confirmation before deleting a CRL schedule via the ConfirmModal.
    /// </summary>
    const handleDelete = (schedule: any) => {
        setConfirmAction({
            title: 'Delete CRL Schedule',
            message: `Are you sure you want to delete "${schedule.name}"? This action cannot be undone.`,
            action: async () => {
                await apiDelete(`/api/v1/admin/crl-schedules/${schedule.id || schedule.scheduleId}`);
                load();
            },
        });
    };

    const startEdit = (s: any) => {
        setEditingId(s.id || s.scheduleId);
        setEditForm({
            updateInterval: s.updateInterval || s.cronExpression || '',
            overlapPeriod: s.overlapPeriod ? String(s.overlapPeriod) : '',
            deltaInterval: s.deltaInterval || '',
            description: s.description || '',
        });
    };

    const handleSaveEdit = async (s: any) => {
        setSaving(true);
        try {
            await apiPut(`/api/v1/admin/crl-schedules/${s.id || s.scheduleId}`, {
                updateInterval: editForm.updateInterval,
                overlapPeriod: editForm.overlapPeriod,
                deltaInterval: editForm.deltaInterval,
                description: editForm.description,
                isDelta: s.isDelta ?? false,
            });
            setEditingId(null);
            load();
            showToast('success', 'CRL schedule updated');
        } catch (err: any) {
            showToast('error', err.message || 'Failed to update schedule');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">CRL Schedules</h2>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors">
                    {showCreate ? 'Cancel' : 'Create Schedule'}
                </button>
            </div>

            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New CRL Schedule</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name</label>
                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cron Expression</label>
                            <input type="text" placeholder="e.g. 0 */6 * * *" value={form.cronExpression} onChange={(e) => setForm({ ...form, cronExpression: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Certificate Authority</label>
                            <select value={form.caId} onChange={(e) => setForm({ ...form, caId: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500">
                                <option value="">Select CA...</option>
                                {cas.map((ca) => (
                                    <option key={ca.id || ca.caId} value={ca.id || ca.caId}>{ca.name || ca.subjectDN}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Overlap Period</label>
                            <input type="text" placeholder="e.g. 1h, 30m" value={form.overlapPeriod} onChange={(e) => setForm({ ...form, overlapPeriod: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500" />
                        </div>
                    </div>
                    <button onClick={handleCreate} disabled={creating || !form.name || !form.cronExpression}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && schedules.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No CRL schedules configured</div>
                )}
                {!loading && !error && schedules.map((s) => {
                    const key = s.id || s.scheduleId || s.name;
                    const expanded = expandedKey === key;
                    return (
                        <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                            <button onClick={() => setExpandedKey(expanded ? null : key)}
                                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors">
                                <span className="text-gray-600 text-xs">{expanded ? '▼' : '▶'}</span>
                                <StatusBadge status={s.enabled ? 'enabled' : 'disabled'} />
                                <span className="text-sm text-gray-900 dark:text-white font-medium">{s.name}</span>
                                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{s.cronExpression}</span>
                                <span className="ml-auto text-xs text-gray-600">Last: {formatDate(s.lastGenerated || s.lastRun)}</span>
                            </button>
                            {expanded && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                    <DetailField label="Name" value={s.name} />
                                    <DetailField label="CA" value={s.caName || s.caId || '-'} />
                                    <DetailField label="Last Generated" value={formatDate(s.lastGenerated || s.lastRun)} />
                                    <DetailField label="Next Update" value={formatDate(s.nextUpdateUtc || s.nextUpdate)} />
                                    <DetailField label="Enabled" value={s.enabled ? 'Yes' : 'No'} />

                                    {editingId === (s.id || s.scheduleId) ? (
                                        <div className="mt-3 space-y-2 p-3 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Update Interval (cron)</label>
                                                    <input type="text" value={editForm.updateInterval} onChange={(e) => setEditForm({ ...editForm, updateInterval: e.target.value })}
                                                        placeholder="0 */6 * * *" className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white font-mono" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Delta Interval (cron)</label>
                                                    <input type="text" value={editForm.deltaInterval} onChange={(e) => setEditForm({ ...editForm, deltaInterval: e.target.value })}
                                                        placeholder="0 * * * *" className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white font-mono" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Overlap Period (e.g. 01:00:00)</label>
                                                    <input type="text" value={editForm.overlapPeriod} onChange={(e) => setEditForm({ ...editForm, overlapPeriod: e.target.value })}
                                                        placeholder="01:00:00" className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white font-mono" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Description</label>
                                                    <input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                                        className="w-full px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white" />
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => handleSaveEdit(s)} disabled={saving}
                                                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                                    {saving ? 'Saving...' : 'Save'}
                                                </button>
                                                <button onClick={() => setEditingId(null)}
                                                    className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <DetailField label="Update Interval" value={s.updateInterval || s.cronExpression} mono />
                                            <DetailField label="Delta Interval" value={s.deltaInterval || '-'} mono />
                                            <DetailField label="Overlap Period" value={s.overlapPeriod ? String(s.overlapPeriod) : '-'} />
                                            <DetailField label="Description" value={s.description || '-'} />
                                        </>
                                    )}

                                    <div className="flex gap-2 mt-3">
                                        {editingId !== (s.id || s.scheduleId) && (
                                            <button onClick={() => startEdit(s)}
                                                className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                                Edit
                                            </button>
                                        )}
                                        <button onClick={() => handleToggle(s)}
                                            className={`px-3 py-1 text-xs rounded border transition-colors ${s.enabled
                                                ? 'bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-900'
                                                : 'bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 hover:bg-green-900'}`}>
                                            {s.enabled ? 'Disable' : 'Enable'}
                                        </button>
                                        <button onClick={() => handleDelete(s)}
                                            className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors">
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <ConfirmModal
                isOpen={!!confirmAction}
                title={confirmAction?.title || ''}
                message={confirmAction?.message || ''}
                confirmLabel="Delete"
                loading={confirmLoading}
                onConfirm={async () => {
                    if (!confirmAction) return;
                    setConfirmLoading(true);
                    try {
                        await confirmAction.action();
                    } catch (err: any) {
                        showToast('error', err.message || 'Operation failed');
                    } finally {
                        setConfirmLoading(false);
                        setConfirmAction(null);
                    }
                }}
                onCancel={() => setConfirmAction(null)}
            />
        </div>
    );
};

/* ─── Current CRLs Section ─── */
const CurrentCrlsSection: React.FC = () => {
    const [cas, setCas] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        apiGet<any>('/api/v1/admin/authorities')
            .then((data) => setCas(Array.isArray(data) ? data : (data.items || data.authorities || [])))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Current CRLs</h2>

            {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400">Loading...</div>}
            {error && <div className="p-4 text-sm text-red-800 dark:text-red-400">{error}</div>}
            {!loading && !error && cas.length === 0 && (
                <div className="p-4 text-sm text-gray-600">No certificate authorities found</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {!loading && !error && cas.map((ca) => {
                    const caId = ca.id || ca.caId;
                    const serial = ca.certificateSerial || ca.serialNumber || ca.certificate?.serialNumber || caId;
                    return (
                        <div key={caId} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{ca.name || ca.subjectDN}</h3>
                            <DetailField label="Serial" value={serial} mono />
                            {ca.crlNumber != null && <DetailField label="CRL Number" value={String(ca.crlNumber)} />}
                            {ca.lastCrlGenerated && <DetailField label="Last Generated" value={formatDate(ca.lastCrlGenerated)} />}
                            {ca.crlEntryCount != null && <DetailField label="Entry Count" value={String(ca.crlEntryCount)} />}
                            <div className="flex gap-2 mt-3">
                                <a href={`${API_BASE}/crl/${serial}`} target="_blank" rel="noopener noreferrer"
                                    className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors inline-block">
                                    Download Full CRL
                                </a>
                                <a href={`${API_BASE}/crl/${serial}/delta`} target="_blank" rel="noopener noreferrer"
                                    className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors inline-block">
                                    Download Delta CRL
                                </a>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/* ─── CRL Management Page ─── */
const CrlManagement: React.FC = () => {
    return (
        <div className="p-6 space-y-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CRL Management</h1>
            <CrlSchedulesSection />
            <CurrentCrlsSection />
        </div>
    );
};

export default CrlManagement;
