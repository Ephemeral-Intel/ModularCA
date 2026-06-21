import React, { useState, useEffect, useMemo } from 'react';
import { apiGet, apiPostWithMfa, apiPutWithMfa, apiDeleteWithMfa } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

/// <summary>
/// Represents a single whitelist rule returned by the admin whitelist API.
/// Matches the backend WhitelistEntity schema.
/// </summary>
interface Whitelist {
    id: string;
    name: string;
    description: string | null;
    scope: 'System' | 'Setup' | 'Auth' | 'Api' | 'ShortUrl' | 'Ca' | 'Protocol' | 'Admin';
    certificateAuthorityId: string | null;
    protocol: string | null;
    cidrs: string[];
    isEnabled: boolean;
    isSystemDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

type WhitelistScope = Whitelist['scope'];

const SCOPES: WhitelistScope[] = ['System', 'Setup', 'Admin', 'Auth', 'Api', 'ShortUrl', 'Ca', 'Protocol'];
const PROTOCOLS = ['ACME', 'EST', 'SCEP', 'CMP', 'OCSP', 'TSA', 'CRL', 'CA'];

/// <summary>
/// Validates a single CIDR string. Accepts IPv4 (optionally with /prefix)
/// and IPv6 (optionally with /prefix). Deliberately loose — the backend
/// does the canonical parse.
/// </summary>
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$|^[0-9a-fA-F:]+(\/\d{1,3})?$/;

function formatDate(d: string | null): string {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

interface FormState {
    name: string;
    description: string;
    scope: WhitelistScope;
    certificateAuthorityId: string;
    protocol: string;
    cidrsText: string;
    isEnabled: boolean;
}

const emptyForm: FormState = {
    name: '',
    description: '',
    scope: 'System',
    certificateAuthorityId: '',
    protocol: '',
    cidrsText: '',
    isEnabled: true,
};

/// <summary>
/// Admin CRUD page for IP whitelist rules. Lists rules from
/// /api/v1/admin/whitelists, supports create/edit/delete with step-up MFA,
/// and validates CIDR entries client-side before submission.
/// </summary>
const Whitelists: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();

    const [whitelists, setWhitelists] = useState<Whitelist[]>([]);
    const [authorities, setAuthorities] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Modal / form state
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Delete confirm modal state
    const [confirmTarget, setConfirmTarget] = useState<Whitelist | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Toggle loading state keyed by whitelist id
    const [togglingId, setTogglingId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            apiGet<any>('/api/v1/admin/whitelists'),
            apiGet<any>('/api/v1/admin/authorities').catch(() => []),
        ])
            .then(([wlData, authData]) => {
                if (cancelled) return;
                const items = Array.isArray(wlData)
                    ? wlData
                    : wlData.items || wlData.whitelists || [];
                setWhitelists(items);

                const cas = Array.isArray(authData)
                    ? authData
                    : authData.items || authData.authorities || [];
                // Flatten nested CA hierarchies if present
                const flat: any[] = [];
                const flatten = (list: any[]) => {
                    for (const ca of list) {
                        flat.push(ca);
                        if (ca.children && Array.isArray(ca.children)) flatten(ca.children);
                    }
                };
                flatten(cas);
                setAuthorities(flat);
                setLoading(false);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load whitelists');
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [refreshTrigger]);

    const caNameById = (caId: string | null): string => {
        if (!caId) return '-';
        const ca = authorities.find((a) => a.id === caId || a.certificateId === caId);
        if (!ca) return caId.substring(0, 8);
        return ca.label || ca.name || ca.commonName || caId.substring(0, 8);
    };

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setFormError(null);
        setShowModal(true);
    };

    const openEdit = (wl: Whitelist) => {
        setEditingId(wl.id);
        setForm({
            name: wl.name,
            description: wl.description || '',
            scope: wl.scope,
            certificateAuthorityId: wl.certificateAuthorityId || '',
            protocol: wl.protocol || '',
            cidrsText: (wl.cidrs || []).join('\n'),
            isEnabled: wl.isEnabled,
        });
        setFormError(null);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm(emptyForm);
        setFormError(null);
    };

    /// <summary>
    /// Splits the textarea cidrs input on newlines, trims each entry, and
    /// filters out empty lines. Used before validation and submission.
    /// </summary>
    const parseCidrs = (text: string): string[] =>
        text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

    const validateForm = (): { ok: boolean; cidrs: string[] } => {
        if (!form.name.trim()) {
            setFormError('Name is required.');
            return { ok: false, cidrs: [] };
        }
        if (form.scope === 'Ca' && !form.certificateAuthorityId) {
            setFormError('Certificate Authority is required for Ca scope.');
            return { ok: false, cidrs: [] };
        }
        if (form.scope === 'Protocol' && !form.protocol) {
            setFormError('Protocol is required for Protocol scope.');
            return { ok: false, cidrs: [] };
        }

        const cidrs = parseCidrs(form.cidrsText);
        for (const cidr of cidrs) {
            if (!CIDR_REGEX.test(cidr)) {
                setFormError(`Invalid CIDR: "${cidr}"`);
                return { ok: false, cidrs: [] };
            }
        }
        setFormError(null);
        return { ok: true, cidrs };
    };

    const handleSave = async () => {
        const { ok, cidrs } = validateForm();
        if (!ok) return;

        setSaving(true);
        try {
            if (editingId) {
                // scope, certificateAuthorityId, and protocol are create-only on the
                // backend — they form the unique composite index, and
                // UpdateWhitelistRequest deliberately does not bind them. Only
                // send the mutable fields on PUT. To change scope/CA/protocol the
                // operator must delete and recreate.
                const updateBody: any = {
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    cidrs,
                    isEnabled: form.isEnabled,
                };
                await apiPutWithMfa(
                    `/api/v1/admin/whitelists/${editingId}`,
                    updateBody,
                    requireStepUp,
                    'update-whitelist',
                    editingId,
                );
                showToast('success', 'Whitelist updated');
            } else {
                const createBody: any = {
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    scope: form.scope,
                    certificateAuthorityId:
                        form.scope === 'Ca'
                            ? form.certificateAuthorityId
                            : form.scope === 'Protocol' && form.certificateAuthorityId
                            ? form.certificateAuthorityId
                            : null,
                    protocol: form.scope === 'Protocol' ? form.protocol : null,
                    cidrs,
                    isEnabled: form.isEnabled,
                };
                await apiPostWithMfa(
                    '/api/v1/admin/whitelists',
                    createBody,
                    requireStepUp,
                    'create-whitelist',
                );
                showToast('success', 'Whitelist created');
            }

            closeModal();
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            setFormError(err.message || 'Failed to save whitelist');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (wl: Whitelist) => {
        setConfirmTarget(wl);
    };

    const performDelete = async () => {
        if (!confirmTarget) return;
        setConfirmLoading(true);
        try {
            await apiDeleteWithMfa(
                `/api/v1/admin/whitelists/${confirmTarget.id}`,
                requireStepUp,
                'delete-whitelist',
                confirmTarget.id,
            );
            showToast('success', 'Whitelist deleted');
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            const msg = (err && err.message) || '';
            if (msg.includes('409') || /system[- ]default/i.test(msg)) {
                showToast(
                    'error',
                    'System-default whitelists cannot be deleted — edit them instead.',
                );
            } else {
                showToast('error', msg || 'Failed to delete whitelist');
            }
        } finally {
            setConfirmLoading(false);
            setConfirmTarget(null);
        }
    };

    /// <summary>
    /// Fast toggle for the IsEnabled flag. Sends a PUT payload with only the
    /// mutable fields the backend's UpdateWhitelistRequest binds. scope,
    /// certificateAuthorityId, and protocol are create-only (unique composite
    /// index) and must not be sent on update.
    /// </summary>
    const toggleEnabled = async (wl: Whitelist) => {
        setTogglingId(wl.id);
        try {
            await apiPutWithMfa(
                `/api/v1/admin/whitelists/${wl.id}`,
                {
                    name: wl.name,
                    description: wl.description,
                    cidrs: wl.cidrs,
                    isEnabled: !wl.isEnabled,
                },
                requireStepUp,
                'update-whitelist',
                wl.id,
            );
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to toggle whitelist');
        } finally {
            setTogglingId(null);
        }
    };

    const sorted = useMemo(() => {
        const scopeOrder: Record<WhitelistScope, number> = {
            System: 0,
            Setup: 1,
            Admin: 2,
            Auth: 3,
            Api: 4,
            ShortUrl: 5,
            Ca: 6,
            Protocol: 7,
        };
        return [...whitelists].sort((a, b) => {
            const ds = scopeOrder[a.scope] - scopeOrder[b.scope];
            if (ds !== 0) return ds;
            return a.name.localeCompare(b.name);
        });
    }, [whitelists]);

    const inputClass =
        'w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500';
    const labelClass = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1';

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Whitelists</h1>
                    <p className="text-xs text-gray-600 mt-1">
                        IP allow-list rules for setup, auth, protocol, and CA-scoped endpoints. System defaults are
                        seeded on first bootstrap and can be edited but not deleted.
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                    New Whitelist
                </button>
            </div>

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Rules ({sorted.length})
                    </h3>
                </div>

                {loading && (
                    <div className="p-6 flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <svg
                            className="animate-spin h-4 w-4 text-blue-500"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                            ></circle>
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                            ></path>
                        </svg>
                        Loading whitelists...
                    </div>
                )}

                {error && (
                    <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>
                )}

                {!loading && !error && sorted.length === 0 && (
                    <div className="p-8 text-sm text-gray-600 text-center space-y-2">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">No whitelist rules found.</p>
                        <p>
                            Whitelist rules are normally seeded on first bootstrap (System, Setup, Api, Auth). If this
                            list is empty, the seeder may not have run yet — reload after running the setup wizard.
                        </p>
                    </div>
                )}

                {!loading && !error && sorted.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px] text-sm">
                            <thead>
                                <tr className="text-xs text-gray-600 font-semibold border-b border-gray-300 dark:border-gray-700">
                                    <th className="text-left px-4 py-2">Name</th>
                                    <th className="text-left px-4 py-2">Scope</th>
                                    <th className="text-left px-4 py-2">Protocol</th>
                                    <th className="text-left px-4 py-2">CA</th>
                                    <th className="text-left px-4 py-2">CIDRs</th>
                                    <th className="text-left px-4 py-2">Enabled</th>
                                    <th className="text-left px-4 py-2">Updated</th>
                                    <th className="text-right px-4 py-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((wl) => (
                                    <tr
                                        key={wl.id}
                                        className="border-b border-gray-300 dark:border-gray-700/50 last:border-b-0 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-900 dark:text-white font-medium">{wl.name}</span>
                                                {wl.isSystemDefault && (
                                                    <span className="px-1.5 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded">
                                                        System Default
                                                    </span>
                                                )}
                                            </div>
                                            {wl.description && (
                                                <div className="text-xs text-gray-600 mt-0.5 truncate max-w-xs">
                                                    {wl.description}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                                                {wl.scope}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                                            {wl.protocol || '-'}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 truncate max-w-[160px]">
                                            {caNameById(wl.certificateAuthorityId)}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                                            {(wl.cidrs || []).length}
                                        </td>
                                        <td className="px-4 py-2">
                                            <button
                                                onClick={() => toggleEnabled(wl)}
                                                disabled={togglingId === wl.id}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                                    wl.isEnabled ? 'bg-green-600' : 'bg-gray-400 dark:bg-gray-600'
                                                } ${togglingId === wl.id ? 'opacity-50 cursor-wait' : ''}`}
                                                title={wl.isEnabled ? 'Disable' : 'Enable'}
                                            >
                                                <span
                                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                                        wl.isEnabled ? 'translate-x-5' : 'translate-x-1'
                                                    }`}
                                                />
                                            </button>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                                            {formatDate(wl.updatedAt)}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <div className="inline-flex gap-2">
                                                <button
                                                    onClick={() => openEdit(wl)}
                                                    className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(wl)}
                                                    disabled={wl.isSystemDefault}
                                                    className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                    title={
                                                        wl.isSystemDefault
                                                            ? 'System-default whitelists cannot be deleted'
                                                            : 'Delete whitelist'
                                                    }
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                {editingId ? 'Edit Whitelist' : 'New Whitelist'}
                            </h3>
                            <button
                                onClick={closeModal}
                                className="text-gray-600 hover:text-gray-900 dark:hover:text-white transition-colors"
                                title="Close"
                            >
                                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className={labelClass}>Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g., corporate-network"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <label className={labelClass}>Description</label>
                                <input
                                    type="text"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="Optional description"
                                    className={inputClass}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Scope *</label>
                                    <select
                                        value={form.scope}
                                        onChange={(e) => {
                                            const scope = e.target.value as WhitelistScope;
                                            setForm({
                                                ...form,
                                                scope,
                                                certificateAuthorityId:
                                                    scope === 'Ca' || scope === 'Protocol'
                                                        ? form.certificateAuthorityId
                                                        : '',
                                                protocol: scope === 'Protocol' ? form.protocol : '',
                                            });
                                        }}
                                        className={inputClass}
                                    >
                                        {SCOPES.map((s) => (
                                            <option key={s} value={s}>
                                                {s}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {(form.scope === 'Ca' || form.scope === 'Protocol') && (
                                    <div>
                                        <label className={labelClass}>Certificate Authority *</label>
                                        <select
                                            value={form.certificateAuthorityId}
                                            onChange={(e) =>
                                                setForm({ ...form, certificateAuthorityId: e.target.value })
                                            }
                                            className={inputClass}
                                        >
                                            <option value="">-- Select CA --</option>
                                            {authorities.map((ca) => (
                                                <option key={ca.id} value={ca.id}>
                                                    {ca.label || ca.name || ca.commonName || ca.id}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {form.scope === 'Protocol' && (
                                    <div>
                                        <label className={labelClass}>Protocol *</label>
                                        <select
                                            value={form.protocol}
                                            onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                                            className={inputClass}
                                        >
                                            <option value="">-- Select Protocol --</option>
                                            {PROTOCOLS.map((p) => (
                                                <option key={p} value={p}>
                                                    {p}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className={labelClass}>
                                    CIDRs (one per line)
                                </label>
                                <textarea
                                    value={form.cidrsText}
                                    onChange={(e) => setForm({ ...form, cidrsText: e.target.value })}
                                    placeholder={'10.0.0.0/8\n192.168.0.0/16\n::1/128'}
                                    rows={6}
                                    className={`${inputClass} font-mono`}
                                />
                                <p className="text-[11px] text-gray-600 mt-1">
                                    An empty list means "block all" for a matched rule. Use <code>0.0.0.0/0</code>{' '}
                                    and <code>::/0</code> to allow any IP.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    id="wl-enabled"
                                    type="checkbox"
                                    checked={form.isEnabled}
                                    onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
                                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="wl-enabled" className="text-sm text-gray-700 dark:text-gray-300">
                                    Enabled
                                </label>
                            </div>

                            {formError && (
                                <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded p-3">
                                    <p className="text-sm text-red-800 dark:text-red-300">{formError}</p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-gray-300 dark:border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={closeModal}
                                disabled={saving}
                                className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!confirmTarget}
                title="Delete Whitelist"
                message={
                    confirmTarget
                        ? `Delete whitelist "${confirmTarget.name}"? This action cannot be undone.`
                        : ''
                }
                confirmLabel="Delete"
                loading={confirmLoading}
                onConfirm={performDelete}
                onCancel={() => setConfirmTarget(null)}
            />
        </div>
    );
};

export default Whitelists;
