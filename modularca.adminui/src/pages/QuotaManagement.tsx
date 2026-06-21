import React, { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../api/client';
import { useToast } from '../context/ToastContext';

/// <summary>
/// Quota management page displaying CA certificate quotas with usage bars,
/// summary statistics, and inline editing for max certificates and max pending limits.
/// </summary>
const QuotaManagement: React.FC = () => {
    const { showToast } = useToast();
    const [quotas, setQuotas] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editMaxCerts, setEditMaxCerts] = useState(0);
    const [editMaxPending, setEditMaxPending] = useState(0);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        apiGet<any>('/api/v1/admin/quotas')
            .then((data) => {
                if (cancelled) return;
                setQuotas(Array.isArray(data) ? data : (data.caQuotas || data.items || data.quotas || []));
                setLoading(false);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load quotas');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [refreshTrigger]);

    const usagePercent = (issued: number, max: number) => {
        if (!max || max <= 0) return 0;
        return Math.min(100, Math.round((issued / max) * 100));
    };

    const usageBarColor = (percent: number) => {
        if (percent > 80) return 'bg-red-500';
        if (percent >= 60) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    const usageTextColor = (percent: number) => {
        if (percent > 80) return 'text-red-800 dark:text-red-400';
        if (percent >= 60) return 'text-yellow-800 dark:text-yellow-400';
        return 'text-green-800 dark:text-green-400';
    };

    // Summary stats
    const totalCAs = quotas.length;
    const casAtLimit = quotas.filter((q) => {
        const pct = usagePercent(q.issuedCount ?? 0, q.maxCertificates ?? 0);
        return pct >= 100;
    }).length;
    const casNearLimit = quotas.filter((q) => {
        const pct = usagePercent(q.issuedCount ?? 0, q.maxCertificates ?? 0);
        return pct >= 80 && pct < 100;
    }).length;

    const startEditing = (quota: any) => {
        setEditingId(quota.groupId || quota.id);
        setEditMaxCerts(quota.maxCertificates ?? 0);
        setEditMaxPending(quota.maxPendingRequests ?? 0);
    };

    const handleSave = async (quota: any) => {
        setSaving(true);
        const id = quota.groupId || quota.id;
        try {
            await apiPut(`/api/v1/admin/quotas/${id}`, {
                maxCertificates: editMaxCerts,
                maxPendingRequests: editMaxPending,
            });
            setEditingId(null);
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to update quota');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quota Management</h1>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                    <div className="text-xs text-gray-600 uppercase tracking-wider">Total CAs</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalCAs}</div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                    <div className="text-xs text-gray-600 uppercase tracking-wider">CAs at Limit</div>
                    <div className="text-2xl font-bold text-red-800 dark:text-red-400 mt-1">{casAtLimit}</div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                    <div className="text-xs text-gray-600 uppercase tracking-wider">CAs Near Limit (&gt;80%)</div>
                    <div className="text-2xl font-bold text-yellow-800 dark:text-yellow-400 mt-1">{casNearLimit}</div>
                </div>
            </div>

            {/* Quota Table */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Certificate Quotas</h3>
                </div>

                {/* Table Header */}
                <div className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 grid grid-cols-[1fr_90px_90px_90px_180px_80px_80px_80px] gap-2 items-center text-xs text-gray-600 font-semibold">
                    <span>CA Name</span>
                    <span>Max Certs</span>
                    <span>Issued</span>
                    <span>Remaining</span>
                    <span>Usage</span>
                    <span>Pending</span>
                    <span>Max Pending</span>
                    <span>Actions</span>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && quotas.length === 0 && (
                        <div className="p-4 text-sm text-gray-600 text-center">No quotas configured</div>
                    )}
                    {!loading && !error && quotas.map((quota) => {
                        const id = quota.groupId || quota.id;
                        const maxCerts = quota.maxCertificates ?? 0;
                        const issued = quota.issuedCount ?? 0;
                        const remaining = Math.max(0, maxCerts - issued);
                        const pct = usagePercent(issued, maxCerts);
                        const isEditing = editingId === id;

                        return (
                            <div key={id} className="px-4 py-3 border-b border-gray-300 dark:border-gray-700 last:border-b-0 grid grid-cols-[1fr_90px_90px_90px_180px_80px_80px_80px] gap-2 items-center">
                                <span className="text-sm text-gray-900 dark:text-white font-medium truncate">
                                    {quota.caName || quota.name || quota.displayName || id}
                                </span>

                                {isEditing ? (
                                    <>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={editMaxCerts}
                                            onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditMaxCerts(v === '' ? 0 : parseInt(v, 10)); }}
                                            className="px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white w-full focus:outline-none focus:border-blue-500"
                                        />
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{issued}</span>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{Math.max(0, editMaxCerts - issued)}</span>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${usageBarColor(usagePercent(issued, editMaxCerts))}`}
                                                    style={{ width: `${usagePercent(issued, editMaxCerts)}%` }}
                                                />
                                            </div>
                                            <span className={`text-xs font-mono w-10 text-right ${usageTextColor(usagePercent(issued, editMaxCerts))}`}>
                                                {usagePercent(issued, editMaxCerts)}%
                                            </span>
                                        </div>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{quota.pendingCount ?? 0}</span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={editMaxPending}
                                            onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditMaxPending(v === '' ? 0 : parseInt(v, 10)); }}
                                            className="px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white w-full focus:outline-none focus:border-blue-500"
                                        />
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleSave(quota)}
                                                disabled={saving}
                                                className="px-2 py-1 text-[10px] bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                                            >
                                                {saving ? '...' : 'Save'}
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="px-2 py-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                X
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{maxCerts || 'Unlimited'}</span>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{issued}</span>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{maxCerts ? remaining : '-'}</span>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${usageBarColor(pct)}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className={`text-xs font-mono w-10 text-right ${usageTextColor(pct)}`}>
                                                {maxCerts ? `${pct}%` : '-'}
                                            </span>
                                        </div>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{quota.pendingCount ?? 0}</span>
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{quota.maxPendingRequests ?? '-'}</span>
                                        <button
                                            onClick={() => startEditing(quota)}
                                            className="px-2 py-1 text-[10px] bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors"
                                        >
                                            Edit
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default QuotaManagement;
