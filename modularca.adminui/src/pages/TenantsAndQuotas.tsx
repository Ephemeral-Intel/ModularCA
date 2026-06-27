import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiPutWithMfa, apiDeleteWithMfa } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useStepUp } from '../components/StepUpMfaContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import ConfirmModal from '../components/ConfirmModal';

/* ── shared helpers ───────────────────────────────────────────────────────── */
function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const usagePercent = (used: number, max: number) => (!max || max <= 0 ? 0 : Math.min(100, Math.round((used / max) * 100)));
const usageBarColor = (p: number) => (p > 80 ? 'bg-red-500' : p >= 60 ? 'bg-yellow-500' : 'bg-green-500');
const usageTextColor = (p: number) => (p > 80 ? 'text-red-800 dark:text-red-400' : p >= 60 ? 'text-yellow-800 dark:text-yellow-400' : 'text-green-800 dark:text-green-400');
// 0 = unlimited by convention across tenant and CA quotas.
const fmtLimit = (used: number, max: number) => (max > 0 ? `${used} / ${max}` : `${used} / ∞`);

const numInput = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500';
const labelCls = 'text-xs text-gray-600 block mb-1';

interface Quota {
    groupId: string | null;
    maxCertificates: number;
    maxPendingRequests: number;
    issuedCount: number;
    pendingCount: number;
    remainingCount: number;
    usagePercent: number;
    isExceeded: boolean;
}
interface Ca {
    id: string;
    name: string;
    label?: string;
    type: string;
    isEnabled: boolean;
    isSshCa: boolean;
    quota: Quota | null;
}
interface Tenant {
    id: string;
    name: string;
    slug?: string;
    description?: string;
    isEnabled: boolean;
    isSystemTenant: boolean;
    createdAt: string;
    maxCertificateAuthorities: number;
    maxCertificatesTotal: number;
    maxUsers: number;
    requireKeyCeremony: boolean;
    ceremonyRequiredApprovals: number;
    caCount: number;
    userCount: number;
    issuedCertificates: number;
    certificateAuthorities: Ca[];
}

/* ── per-CA quota row (nested inside a tenant) ────────────────────────────── */
const CaQuotaRow: React.FC<{ ca: Ca; onChanged: () => void }> = ({ ca, onChanged }) => {
    const { showToast } = useToast();
    const q = ca.quota;
    const [editing, setEditing] = useState(false);
    const [maxCerts, setMaxCerts] = useState(q?.maxCertificates ?? 0);
    const [maxPending, setMaxPending] = useState(q?.maxPendingRequests ?? 0);
    const [saving, setSaving] = useState(false);

    const issued = q?.issuedCount ?? 0;
    const pending = q?.pendingCount ?? 0;
    const liveMax = editing ? maxCerts : (q?.maxCertificates ?? 0);
    const pct = usagePercent(issued, liveMax);

    const startEdit = () => { setMaxCerts(q?.maxCertificates ?? 0); setMaxPending(q?.maxPendingRequests ?? 0); setEditing(true); };

    const save = async () => {
        if (!q?.groupId) return;
        setSaving(true);
        try {
            await apiPut(`/api/v1/admin/quotas/${q.groupId}`, { maxCertificates: maxCerts, maxPendingRequests: maxPending });
            setEditing(false);
            onChanged();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to update quota');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="px-3 py-2 grid grid-cols-[1fr_70px_70px_70px_150px_70px_70px_80px] gap-2 items-center border-b border-gray-200 dark:border-gray-700/60 last:border-b-0 text-xs">
            <div className="min-w-0">
                <span className="text-gray-900 dark:text-white truncate block">{ca.label || ca.name}</span>
                <span className="text-[10px] text-gray-500">{ca.type}{ca.isSshCa ? ' · SSH' : ''}{!ca.isEnabled ? ' · disabled' : ''}</span>
            </div>

            {!q ? (
                <span className="col-span-7 text-gray-500 italic">{ca.isSshCa ? 'Quota not applicable to SSH CA' : 'No admin group / quota'}</span>
            ) : editing ? (
                <>
                    <input inputMode="numeric" value={maxCerts}
                        onChange={(e) => setMaxCerts(parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
                        className="px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded w-full text-gray-900 dark:text-white" />
                    <span className="text-gray-600 dark:text-gray-400">{issued}</span>
                    <span className="text-gray-600 dark:text-gray-400">{Math.max(0, maxCerts - issued)}</span>
                    <div className="flex items-center gap-1">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div className={`h-full rounded-full ${usageBarColor(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`font-mono w-9 text-right ${usageTextColor(pct)}`}>{maxCerts ? `${pct}%` : '-'}</span>
                    </div>
                    <span className="text-gray-600 dark:text-gray-400">{pending}</span>
                    <input inputMode="numeric" value={maxPending}
                        onChange={(e) => setMaxPending(parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
                        className="px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded w-full text-gray-900 dark:text-white" />
                    <div className="flex gap-1">
                        <button onClick={save} disabled={saving} className="px-2 py-1 text-[10px] bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{saving ? '…' : 'Save'}</button>
                        <button onClick={() => setEditing(false)} className="px-2 py-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600">X</button>
                    </div>
                </>
            ) : (
                <>
                    <span className="text-gray-600 dark:text-gray-400">{q.maxCertificates || 'Unlimited'}</span>
                    <span className="text-gray-600 dark:text-gray-400">{issued}</span>
                    <span className="text-gray-600 dark:text-gray-400">{q.maxCertificates ? q.remainingCount : '-'}</span>
                    <div className="flex items-center gap-1">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                            <div className={`h-full rounded-full ${usageBarColor(pct)}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`font-mono w-9 text-right ${usageTextColor(pct)}`}>{q.maxCertificates ? `${pct}%` : '-'}</span>
                    </div>
                    <span className="text-gray-600 dark:text-gray-400">{pending}</span>
                    <span className="text-gray-600 dark:text-gray-400">{q.maxPendingRequests || '-'}</span>
                    <button onClick={startEdit} disabled={!q.groupId}
                        className="px-2 py-1 text-[10px] bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 disabled:opacity-40">Edit</button>
                </>
            )}
        </div>
    );
};

/* ── tenant row (expandable, with nested CA quotas) ───────────────────────── */
const TenantRow: React.FC<{ tenant: Tenant; onChanged: () => void }> = ({ tenant, onChanged }) => {
    const { showToast } = useToast();
    const { requireStepUp } = useStepUp();
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; confirmLabel: string; confirmClass?: string; action: () => Promise<void> } | null>(null);

    const [form, setForm] = useState({
        description: tenant.description || '',
        maxCAs: tenant.maxCertificateAuthorities ?? 0,
        maxCertificates: tenant.maxCertificatesTotal ?? 0,
        maxUsers: tenant.maxUsers ?? 0,
        requireKeyCeremony: tenant.requireKeyCeremony ?? false,
        ceremonyRequiredApprovals: tenant.ceremonyRequiredApprovals ?? 1,
    });

    const startEdit = () => {
        setForm({
            description: tenant.description || '',
            maxCAs: tenant.maxCertificateAuthorities ?? 0,
            maxCertificates: tenant.maxCertificatesTotal ?? 0,
            maxUsers: tenant.maxUsers ?? 0,
            requireKeyCeremony: tenant.requireKeyCeremony ?? false,
            ceremonyRequiredApprovals: tenant.ceremonyRequiredApprovals ?? 1,
        });
        setEditing(true);
    };

    const saveEdit = async () => {
        setSaving(true);
        try {
            // 202 + ceremonyId is returned when the change downgrades tenant security policy
            // (ceremony off, or fewer approvals) and the caller isn't a system-super.
            const result = await apiPut<any>(`/api/v1/admin/tenants/${tenant.id}`, {
                description: form.description,
                maxCertificateAuthorities: form.maxCAs,
                maxCertificatesTotal: form.maxCertificates,
                maxUsers: form.maxUsers,
                requireKeyCeremony: form.requireKeyCeremony,
                ceremonyRequiredApprovals: form.ceremonyRequiredApprovals,
            });
            if (result?.ceremonyId) {
                showToast('info', 'Policy change ceremony started. Approve at /admin/ceremonies/' + result.ceremonyId);
            }
            setEditing(false);
            onChanged();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to update tenant');
        } finally {
            setSaving(false);
        }
    };

    const toggleEnabled = () => {
        const enabling = tenant.isEnabled === false;
        setConfirmAction({
            title: enabling ? 'Enable Tenant' : 'Disable Tenant',
            message: `Are you sure you want to ${enabling ? 'enable' : 'disable'} tenant "${tenant.name}"?`,
            confirmLabel: enabling ? 'Enable' : 'Disable',
            confirmClass: enabling
                ? 'px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors'
                : 'px-4 py-2 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors',
            action: async () => {
                if (enabling) await apiPutWithMfa(`/api/v1/admin/tenants/${tenant.id}`, { isEnabled: true }, requireStepUp, 'enable-tenant', tenant.id);
                else await apiDeleteWithMfa(`/api/v1/admin/tenants/${tenant.id}`, requireStepUp, 'disable-tenant', tenant.id);
                onChanged();
            },
        });
    };

    const softDelete = () => {
        setConfirmAction({
            title: 'Soft Delete Tenant',
            message: `Are you sure you want to disable tenant "${tenant.name}"? This is a soft delete.`,
            confirmLabel: 'Soft Delete',
            action: async () => {
                await apiDeleteWithMfa(`/api/v1/admin/tenants/${tenant.id}`, requireStepUp, 'disable-tenant', tenant.id);
                onChanged();
            },
        });
    };

    const downgrade = (form.requireKeyCeremony === false && tenant.requireKeyCeremony === true) ||
        (form.ceremonyRequiredApprovals < tenant.ceremonyRequiredApprovals);

    return (
        <div className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
            <button onClick={() => setExpanded(!expanded)}
                className="w-full px-4 py-3 grid grid-cols-[auto_1fr_100px_90px_90px_110px_120px] gap-2 items-center text-left hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors">
                <span className="text-gray-600 text-xs w-4">{expanded ? '▼' : '▶'}</span>
                <span className="text-sm text-gray-900 dark:text-white font-medium truncate">
                    {tenant.name}{tenant.isSystemTenant && <span className="ml-2 text-[10px] text-gray-500">(system)</span>}
                </span>
                <StatusBadge status={tenant.isEnabled !== false ? 'active' : 'disabled'} label={tenant.isEnabled !== false ? 'Enabled' : 'Disabled'} />
                <span className="text-xs text-gray-600 dark:text-gray-400" title="CAs / max">{fmtLimit(tenant.caCount, tenant.maxCertificateAuthorities)}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400" title="Users / max">{fmtLimit(tenant.userCount, tenant.maxUsers)}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400" title="Active certs / max">{fmtLimit(tenant.issuedCertificates, tenant.maxCertificatesTotal)}</span>
                <span className="text-xs text-gray-600">{formatDate(tenant.createdAt)}</span>
            </button>

            {expanded && (
                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                    {/* tenant-level detail + edit */}
                    {editing ? (
                        <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-3 space-y-2">
                            <h4 className="text-xs text-gray-600 dark:text-gray-400 font-semibold">Edit Tenant Ceilings</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div><label className={labelCls}>Description</label>
                                    <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={numInput} /></div>
                                <div><label className={labelCls}>Max CAs (0 = unlimited)</label>
                                    <input inputMode="numeric" value={form.maxCAs} onChange={(e) => setForm({ ...form, maxCAs: parseInt(e.target.value.replace(/\D/g, '') || '0', 10) })} className={numInput} /></div>
                                <div><label className={labelCls}>Max Certificates (0 = unlimited)</label>
                                    <input inputMode="numeric" value={form.maxCertificates} onChange={(e) => setForm({ ...form, maxCertificates: parseInt(e.target.value.replace(/\D/g, '') || '0', 10) })} className={numInput} /></div>
                                <div><label className={labelCls}>Max Users (0 = unlimited)</label>
                                    <input inputMode="numeric" value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: parseInt(e.target.value.replace(/\D/g, '') || '0', 10) })} className={numInput} /></div>
                                <div className="flex items-center gap-2 pt-2">
                                    <input type="checkbox" id={`cer-${tenant.id}`} checked={form.requireKeyCeremony}
                                        onChange={(e) => setForm({ ...form, requireKeyCeremony: e.target.checked })}
                                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                                    <label htmlFor={`cer-${tenant.id}`} className="text-xs text-gray-600">Require Key Ceremony for CA Creation</label>
                                </div>
                                {form.requireKeyCeremony && (
                                    <div><label className={labelCls}>Required Approvals</label>
                                        <input inputMode="numeric" value={form.ceremonyRequiredApprovals}
                                            onChange={(e) => setForm({ ...form, ceremonyRequiredApprovals: parseInt(e.target.value.replace(/\D/g, '') || '1', 10) || 1 })} className={numInput} /></div>
                                )}
                            </div>
                            {downgrade && (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded p-3 text-xs text-amber-900 dark:text-amber-200">
                                    This change lowers tenant security policy. Saving will start a key ceremony requiring {tenant.ceremonyRequiredApprovals} approvals from tenant admins before the change takes effect. System admins can bypass this by using the direct API with step-up MFA.
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button onClick={saveEdit} disabled={saving} className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
                                <button onClick={() => setEditing(false)} className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                <DetailField label="ID" value={tenant.id} mono />
                                <DetailField label="Description" value={tenant.description || '-'} />
                                <DetailField label="Max CAs" value={tenant.maxCertificateAuthorities || 'Unlimited'} />
                                <DetailField label="Max Certificates" value={tenant.maxCertificatesTotal || 'Unlimited'} />
                                <DetailField label="Max Users" value={tenant.maxUsers || 'Unlimited'} />
                                <DetailField label="Key Ceremony Required" value={tenant.requireKeyCeremony ? `Yes (${tenant.ceremonyRequiredApprovals} approvals)` : 'No'} />
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button onClick={startEdit} className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900">Edit Ceilings</button>
                                <button onClick={toggleEnabled}
                                    className={`px-3 py-1 text-xs rounded border transition-colors ${tenant.isEnabled !== false
                                        ? 'bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-900'
                                        : 'bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 hover:bg-green-900'}`}>
                                    {tenant.isEnabled !== false ? 'Disable' : 'Enable'}
                                </button>
                                {tenant.isEnabled !== false && !tenant.isSystemTenant && (
                                    <button onClick={softDelete} className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900">Soft Delete</button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* nested per-CA quotas */}
                    <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div className="px-3 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-gray-900 dark:text-white">Per-CA Issuance Quotas</h4>
                            <span className="text-[10px] text-gray-500">{tenant.certificateAuthorities.length} CA{tenant.certificateAuthorities.length !== 1 ? 's' : ''}</span>
                        </div>
                        {tenant.certificateAuthorities.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-gray-500 text-center">No CAs in this tenant</div>
                        ) : (
                            <>
                                <div className="px-3 py-2 border-b border-gray-300 dark:border-gray-700 grid grid-cols-[1fr_70px_70px_70px_150px_70px_70px_80px] gap-2 text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
                                    <span>CA</span><span>Max</span><span>Issued</span><span>Left</span><span>Usage</span><span>Pend</span><span>Max Pend</span><span></span>
                                </div>
                                {tenant.certificateAuthorities.map((ca) => <CaQuotaRow key={ca.id} ca={ca} onChanged={onChanged} />)}
                            </>
                        )}
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!confirmAction}
                title={confirmAction?.title || ''}
                message={confirmAction?.message || ''}
                confirmLabel={confirmAction?.confirmLabel || 'Confirm'}
                confirmClass={confirmAction?.confirmClass}
                onConfirm={async () => {
                    if (!confirmAction) return;
                    const act = confirmAction.action;
                    setConfirmAction(null);
                    try { await act(); }
                    catch (err: any) { if (err?.message !== 'Step-up MFA cancelled') showToast('error', err.message || 'Operation failed'); }
                }}
                onCancel={() => setConfirmAction(null)}
            />
        </div>
    );
};

/* ── page ─────────────────────────────────────────────────────────────────── */
const TenantsAndQuotas: React.FC = () => {
    const { showToast } = useToast();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [totals, setTotals] = useState<{ totalTenants: number; totalCAs: number; casAtLimit: number; casNearLimit: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // create-tenant form
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ name: '', description: '', maxCAs: 0, maxCertificates: 0, maxUsers: 0 });
    const [creating, setCreating] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        apiGet<any>('/api/v1/admin/quotas/by-tenant')
            .then((data) => { setTenants(data.tenants || []); setTotals(data.totals || null); setError(null); })
            .catch((err) => setError(err.message || 'Failed to load'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            await apiPost('/api/v1/admin/tenants', {
                name: createForm.name,
                description: createForm.description,
                maxCertificateAuthorities: createForm.maxCAs,
                maxCertificatesTotal: createForm.maxCertificates,
                maxUsers: createForm.maxUsers,
            });
            setShowCreate(false);
            setCreateForm({ name: '', description: '', maxCAs: 0, maxCertificates: 0, maxUsers: 0 });
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create tenant');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tenants &amp; Quotas</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Tenant rows are org-level ceilings (max CAs / certs / users). Expand a tenant to set per-CA issuance quotas.</p>
                </div>
                <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                    {showCreate ? 'Cancel' : 'Create Tenant'}
                </button>
            </div>

            {/* summary tiles */}
            {totals && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Tenants', value: totals.totalTenants, cls: 'text-gray-900 dark:text-white' },
                        { label: 'Total CAs', value: totals.totalCAs, cls: 'text-gray-900 dark:text-white' },
                        { label: 'CAs at Limit', value: totals.casAtLimit, cls: 'text-red-800 dark:text-red-400' },
                        { label: 'CAs Near Limit (>80%)', value: totals.casNearLimit, cls: 'text-yellow-800 dark:text-yellow-400' },
                    ].map((t) => (
                        <div key={t.label} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                            <div className="text-xs text-gray-600 uppercase tracking-wider">{t.label}</div>
                            <div className={`text-2xl font-bold mt-1 ${t.cls}`}>{t.value}</div>
                        </div>
                    ))}
                </div>
            )}

            {showCreate && (
                <form onSubmit={handleCreate} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New Tenant</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input type="text" placeholder="Tenant Name" required value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                        <input type="text" placeholder="Description" value={createForm.description}
                            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                        <div><label className={labelCls}>Max CAs</label>
                            <input inputMode="numeric" value={createForm.maxCAs} onChange={(e) => setCreateForm({ ...createForm, maxCAs: parseInt(e.target.value.replace(/\D/g, '') || '0', 10) })} className={numInput} /></div>
                        <div><label className={labelCls}>Max Certificates</label>
                            <input inputMode="numeric" value={createForm.maxCertificates} onChange={(e) => setCreateForm({ ...createForm, maxCertificates: parseInt(e.target.value.replace(/\D/g, '') || '0', 10) })} className={numInput} /></div>
                        <div><label className={labelCls}>Max Users</label>
                            <input inputMode="numeric" value={createForm.maxUsers} onChange={(e) => setCreateForm({ ...createForm, maxUsers: parseInt(e.target.value.replace(/\D/g, '') || '0', 10) })} className={numInput} /></div>
                    </div>
                    <button type="submit" disabled={creating} className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{creating ? 'Creating…' : 'Create'}</button>
                </form>
            )}

            {/* tenant list */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 grid grid-cols-[auto_1fr_100px_90px_90px_110px_120px] gap-2 items-center text-xs text-gray-600 font-semibold">
                    <span className="w-4"></span><span>Name</span><span>Status</span><span>CAs</span><span>Users</span><span>Certs</span><span>Created</span>
                </div>
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading…</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && tenants.length === 0 && <div className="p-4 text-sm text-gray-600 text-center">No tenants found</div>}
                {!loading && !error && tenants.map((t) => <TenantRow key={t.id} tenant={t} onChanged={load} />)}
            </div>
        </div>
    );
};

export default TenantsAndQuotas;
