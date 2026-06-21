import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/// <summary>
/// Tenant management page for listing, creating, editing, and disabling tenants
/// with quota configuration and detail views showing resource usage.
/// </summary>
const TenantManagement: React.FC = () => {
    const { showToast } = useToast();
    const [tenants, setTenants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '',
        description: '',
        maxCAs: 0,
        maxCertificates: 0,
        maxUsers: 0,
    });
    const [creating, setCreating] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        description: '',
        maxCAs: 0,
        maxCertificates: 0,
        maxUsers: 0,
        requireKeyCeremony: false,
        ceremonyRequiredApprovals: 1,
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        apiGet<any>('/api/v1/admin/tenants')
            .then((data) => {
                if (cancelled) return;
                setTenants(Array.isArray(data) ? data : (data.items || data.tenants || []));
                setLoading(false);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load tenants');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [refreshTrigger]);

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
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create tenant');
        } finally {
            setCreating(false);
        }
    };

    const startEditing = (tenant: any) => {
        setEditingId(tenant.id);
        setEditForm({
            description: tenant.description || '',
            maxCAs: tenant.maxCertificateAuthorities ?? 0,
            maxCertificates: tenant.maxCertificatesTotal ?? 0,
            maxUsers: tenant.maxUsers ?? 0,
            requireKeyCeremony: tenant.requireKeyCeremony ?? false,
            ceremonyRequiredApprovals: tenant.ceremonyRequiredApprovals ?? 1,
        });
    };

    const handleSaveEdit = async (tenant: any) => {
        setSaving(true);
        try {
            // Backend returns 202 Accepted with { ceremonyId, message, tenant } when the PUT
            // would downgrade tenant security policy (requireKeyCeremony true->false or a
            // decrease in ceremonyRequiredApprovals) and the caller is not a system-super.
            // apiPut returns the parsed JSON body only, so the 202 path is detected by the
            // presence of a ceremonyId in the response. On a normal 200, the body is the
            // updated tenant and ceremonyId is absent. Non-gated fields apply immediately
            // either way, so we still close the panel and refresh.
            const result = await apiPut<any>(`/api/v1/admin/tenants/${tenant.id}`, {
                description: editForm.description,
                maxCertificateAuthorities: editForm.maxCAs,
                maxCertificatesTotal: editForm.maxCertificates,
                maxUsers: editForm.maxUsers,
                requireKeyCeremony: editForm.requireKeyCeremony,
                ceremonyRequiredApprovals: editForm.ceremonyRequiredApprovals,
            });
            if (result?.ceremonyId) {
                // eslint-disable-next-line no-console
                console.info('Tenant policy change ceremony started', { ceremonyId: result.ceremonyId, tenantId: tenant.id });
                showToast('info', 'Policy change ceremony started. Approve at /admin/ceremonies/' + result.ceremonyId);
            }
            setEditingId(null);
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to update tenant');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleEnabled = async (tenant: any) => {
        const action = tenant.isEnabled ? 'disable' : 'enable';
        if (!window.confirm(`Are you sure you want to ${action} tenant "${tenant.name}"?`)) return;
        try {
            if (tenant.isEnabled) {
                // Disable uses DELETE endpoint (soft delete)
                await apiDelete(`/api/v1/admin/tenants/${tenant.id}`);
            } else {
                // Re-enable uses PUT with IsEnabled flag
                await apiPut(`/api/v1/admin/tenants/${tenant.id}`, {
                    isEnabled: true,
                });
            }
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || `Failed to ${action} tenant`);
        }
    };

    const handleDisable = async (tenant: any) => {
        if (!window.confirm(`Are you sure you want to disable tenant "${tenant.name}"? This is a soft delete.`)) return;
        try {
            await apiDelete(`/api/v1/admin/tenants/${tenant.id}`);
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to disable tenant');
        }
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tenants</h1>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors"
                >
                    {showCreate ? 'Cancel' : 'Create Tenant'}
                </button>
            </div>

            {/* Create Tenant Form */}
            {showCreate && (
                <form onSubmit={handleCreate} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New Tenant</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Tenant Name"
                            required
                            value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="text"
                            placeholder="Description"
                            value={createForm.description}
                            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        <div>
                            <label className="text-xs text-gray-600 block mb-1">Max CAs</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={createForm.maxCAs}
                                onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setCreateForm({ ...createForm, maxCAs: v === '' ? '' as any : parseInt(v, 10) }); }}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-600 block mb-1">Max Certificates</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={createForm.maxCertificates}
                                onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setCreateForm({ ...createForm, maxCertificates: v === '' ? '' as any : parseInt(v, 10) }); }}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-600 block mb-1">Max Users</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={createForm.maxUsers}
                                onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setCreateForm({ ...createForm, maxUsers: v === '' ? '' as any : parseInt(v, 10) }); }}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={creating}
                        className="px-4 py-2 text-sm bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </form>
            )}

            {/* Tenant List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">All Tenants ({tenants.length})</h3>
                </div>

                {/* Table Header */}
                <div className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 grid grid-cols-[auto_1fr_100px_80px_80px_80px_120px] gap-2 items-center text-xs text-gray-600 font-semibold">
                    <span className="w-4"></span>
                    <span>Name</span>
                    <span>Status</span>
                    <span>CAs</span>
                    <span>Users</span>
                    <span>Certs</span>
                    <span>Created</span>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && tenants.length === 0 && (
                        <div className="p-4 text-sm text-gray-600 text-center">No tenants found</div>
                    )}
                    {!loading && !error && tenants.map((tenant) => {
                        const expanded = expandedKey === tenant.id;
                        const isEditing = editingId === tenant.id;

                        return (
                            <div key={tenant.id} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => setExpandedKey(expanded ? null : tenant.id)}
                                    className="w-full px-4 py-3 grid grid-cols-[auto_1fr_100px_80px_80px_80px_120px] gap-2 items-center text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs w-4">{expanded ? '\u25BC' : '\u25B6'}</span>
                                    <span className="text-sm text-gray-900 dark:text-white font-medium truncate">{tenant.name}</span>
                                    <StatusBadge
                                        status={tenant.isEnabled !== false ? 'active' : 'disabled'}
                                        label={tenant.isEnabled !== false ? 'Enabled' : 'Disabled'}
                                    />
                                    <span className="text-xs text-gray-600 dark:text-gray-400">{tenant.caCount ?? '-'}</span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400">{tenant.userCount ?? '-'}</span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400">{tenant.certCount ?? tenant.certificateCount ?? '-'}</span>
                                    <span className="text-xs text-gray-600">{formatDate(tenant.createdAt)}</span>
                                </button>

                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                                        <div>
                                            <DetailField label="ID" value={tenant.id} mono />
                                            <DetailField label="Name" value={tenant.name} />
                                            <DetailField label="Description" value={tenant.description || '-'} />
                                            <DetailField label="Enabled" value={tenant.isEnabled !== false ? 'Yes' : 'No'} />
                                            <DetailField label="CA Count" value={tenant.caCount ?? '-'} />
                                            <DetailField label="User Count" value={tenant.userCount ?? '-'} />
                                            <DetailField label="Certificate Count" value={tenant.certCount ?? tenant.certificateCount ?? '-'} />
                                            <DetailField label="Max CAs" value={(tenant.maxCertificateAuthorities ?? tenant.maxCAs) || 'Unlimited'} />
                                            <DetailField label="Max Certificates" value={(tenant.maxCertificatesTotal ?? tenant.maxCertificates) || 'Unlimited'} />
                                            <DetailField label="Max Users" value={tenant.maxUsers || 'Unlimited'} />
                                            <DetailField label="Key Ceremony Required" value={tenant.requireKeyCeremony ? 'Yes' : 'No'} />
                                            {tenant.requireKeyCeremony && (
                                                <DetailField label="Ceremony Required Approvals" value={tenant.ceremonyRequiredApprovals ?? 1} />
                                            )}
                                            <DetailField label="Created" value={formatDate(tenant.createdAt)} />
                                        </div>

                                        {/* Edit section */}
                                        {isEditing ? (
                                            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-3 space-y-2">
                                                <h4 className="text-xs text-gray-600 dark:text-gray-400 font-semibold">Edit Tenant Quotas</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs text-gray-600 block mb-1">Description</label>
                                                        <input
                                                            type="text"
                                                            value={editForm.description}
                                                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-gray-600 block mb-1">Max CAs</label>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={editForm.maxCAs}
                                                            onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditForm({ ...editForm, maxCAs: v === '' ? '' as any : parseInt(v, 10) }); }}
                                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-gray-600 block mb-1">Max Certificates</label>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={editForm.maxCertificates}
                                                            onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditForm({ ...editForm, maxCertificates: v === '' ? '' as any : parseInt(v, 10) }); }}
                                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-gray-600 block mb-1">Max Users</label>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={editForm.maxUsers}
                                                            onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditForm({ ...editForm, maxUsers: v === '' ? '' as any : parseInt(v, 10) }); }}
                                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2 pt-2">
                                                        <input
                                                            type="checkbox"
                                                            id={`ceremony-toggle-${tenant.id}`}
                                                            checked={editForm.requireKeyCeremony}
                                                            onChange={(e) => setEditForm({ ...editForm, requireKeyCeremony: e.target.checked })}
                                                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <label htmlFor={`ceremony-toggle-${tenant.id}`} className="text-xs text-gray-600">Require Key Ceremony for CA Creation</label>
                                                    </div>
                                                    {editForm.requireKeyCeremony && (
                                                        <div>
                                                            <label className="text-xs text-gray-600 block mb-1">Required Approvals</label>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={editForm.ceremonyRequiredApprovals}
                                                                onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setEditForm({ ...editForm, ceremonyRequiredApprovals: v === '' ? '' as any : parseInt(v, 10) || 1 }); }}
                                                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Downgrade warning: show when toggling ceremony off OR lowering approvals. N is the CURRENT tenant value. */}
                                                {(
                                                    (editForm.requireKeyCeremony === false && tenant.requireKeyCeremony === true) ||
                                                    (editForm.ceremonyRequiredApprovals < tenant.ceremonyRequiredApprovals)
                                                ) && (
                                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded p-3 text-xs text-amber-900 dark:text-amber-200">
                                                        This change lowers tenant security policy. Saving will start a key ceremony requiring {tenant.ceremonyRequiredApprovals} approvals from tenant admins before the change takes effect. System admins can bypass this by using the direct API with step-up MFA.
                                                    </div>
                                                )}
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleSaveEdit(tenant)}
                                                        disabled={saving}
                                                        className="px-3 py-1 text-xs bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        {saving ? 'Saving...' : 'Save'}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => startEditing(tenant)}
                                                    className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors"
                                                >
                                                    Edit Quotas
                                                </button>
                                                <button
                                                    onClick={() => handleToggleEnabled(tenant)}
                                                    className={`px-3 py-1 text-xs rounded border transition-colors ${
                                                        tenant.isEnabled !== false
                                                            ? 'bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700 hover:bg-yellow-900'
                                                            : 'bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 hover:bg-green-900'
                                                    }`}
                                                >
                                                    {tenant.isEnabled !== false ? 'Disable' : 'Enable'}
                                                </button>
                                                {tenant.isEnabled !== false && (
                                                    <button
                                                        onClick={() => handleDisable(tenant)}
                                                        className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors"
                                                    >
                                                        Soft Delete
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default TenantManagement;
