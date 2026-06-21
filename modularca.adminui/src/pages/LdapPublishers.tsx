import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import ConfirmModal from '../components/ConfirmModal';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface LdapPublisher {
    id: string;
    name: string;
    host: string;
    port: number;
    useSsl: boolean;
    username: string;
    baseDn: string;
    userDnTemplate: string;
    updateInterval: string;
    enabled: boolean;
    publishCaCertificate: boolean;
    publishCrl: boolean;
    publishDeltaCrl: boolean;
    publishUserCertificates: boolean;
    lastUpdated: string | null;
    nextUpdate: string | null;
}

const defaultForm = {
    name: '',
    host: '',
    port: '389',
    useSsl: false,
    username: '',
    password: '',
    baseDn: '',
    userDnTemplate: '',
    updateInterval: '',
    enabled: true,
    publishCaCertificate: true,
    publishCrl: true,
    publishDeltaCrl: false,
    publishUserCertificates: false,
};

const LdapPublishers: React.FC = () => {
    const { caId } = useParams<{ caId: string }>();
    const { showToast } = useToast();

    const [caName, setCaName] = useState<string>('');
    const [publishers, setPublishers] = useState<LdapPublisher[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ ...defaultForm });

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ ...defaultForm });
    const [saving, setSaving] = useState(false);

    // Test connection state
    const [testingId, setTestingId] = useState<string | null>(null);

    // Confirm modal
    const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; title: string; message: string } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    const basePath = `/api/v1/admin/authorities/${caId}/ldap-publishers`;

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>(basePath)
            .then((data) => setPublishers(Array.isArray(data) ? data : (data.items || data.publishers || [])))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!caId) return;
        load();
        apiGet<any>('/api/v1/admin/authorities/hierarchy')
            .then((data) => {
                const flat = flattenCas(Array.isArray(data) ? data : (data.items || data.authorities || []));
                const ca = flat.find((c: any) => (c.id || c.certificateId) === caId);
                if (ca) setCaName(ca.name || ca.subjectDN || caId);
                else setCaName(caId);
            })
            .catch(() => setCaName(caId));
    }, [caId]);

    const flattenCas = (cas: any[]): any[] => {
        const result: any[] = [];
        for (const ca of cas) {
            result.push(ca);
            if (ca.children?.length > 0) result.push(...flattenCas(ca.children));
        }
        return result;
    };

    const handleCreate = async () => {
        if (!form.name.trim() || !form.host.trim() || !form.baseDn.trim()) {
            showToast('error', 'Name, Host, and Base DN are required');
            return;
        }
        setCreating(true);
        try {
            await apiPost(basePath, {
                name: form.name,
                host: form.host,
                port: parseInt(form.port, 10) || 389,
                useSsl: form.useSsl,
                username: form.username || undefined,
                password: form.password || undefined,
                baseDn: form.baseDn,
                userDnTemplate: form.userDnTemplate || undefined,
                updateInterval: form.updateInterval || undefined,
                enabled: form.enabled,
                publishCaCertificate: form.publishCaCertificate,
                publishCrl: form.publishCrl,
                publishDeltaCrl: form.publishDeltaCrl,
                publishUserCertificates: form.publishUserCertificates,
            });
            showToast('success', 'LDAP publisher created');
            setShowCreate(false);
            setForm({ ...defaultForm });
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create publisher');
        } finally {
            setCreating(false);
        }
    };

    const startEdit = (p: LdapPublisher) => {
        setEditingId(p.id);
        setEditForm({
            name: p.name || '',
            host: p.host || '',
            port: String(p.port || 389),
            useSsl: p.useSsl ?? false,
            username: p.username || '',
            password: '',
            baseDn: p.baseDn || '',
            userDnTemplate: p.userDnTemplate || '',
            updateInterval: p.updateInterval || '',
            enabled: p.enabled ?? true,
            publishCaCertificate: p.publishCaCertificate ?? true,
            publishCrl: p.publishCrl ?? true,
            publishDeltaCrl: p.publishDeltaCrl ?? false,
            publishUserCertificates: p.publishUserCertificates ?? false,
        });
    };

    const handleSaveEdit = async (p: LdapPublisher) => {
        if (!editForm.name.trim() || !editForm.host.trim() || !editForm.baseDn.trim()) {
            showToast('error', 'Name, Host, and Base DN are required');
            return;
        }
        setSaving(true);
        try {
            await apiPut(`${basePath}/${p.id}`, {
                name: editForm.name,
                host: editForm.host,
                port: parseInt(editForm.port, 10) || 389,
                useSsl: editForm.useSsl,
                username: editForm.username || undefined,
                password: editForm.password || undefined,
                baseDn: editForm.baseDn,
                userDnTemplate: editForm.userDnTemplate || undefined,
                updateInterval: editForm.updateInterval || undefined,
                enabled: editForm.enabled,
                publishCaCertificate: editForm.publishCaCertificate,
                publishCrl: editForm.publishCrl,
                publishDeltaCrl: editForm.publishDeltaCrl,
                publishUserCertificates: editForm.publishUserCertificates,
            });
            showToast('success', 'LDAP publisher updated');
            setEditingId(null);
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to update publisher');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (p: LdapPublisher) => {
        setConfirmAction({
            title: 'Delete LDAP Publisher',
            message: `Are you sure you want to delete "${p.name}"? This action cannot be undone.`,
            action: async () => {
                await apiDelete(`${basePath}/${p.id}`);
                showToast('success', 'LDAP publisher deleted');
                load();
            },
        });
    };

    const handleTest = async (p: LdapPublisher) => {
        setTestingId(p.id);
        try {
            const result = await apiPost<any>(`${basePath}/${p.id}/test`, {});
            if (result?.success) {
                showToast('success', result.message || 'Connection successful');
            } else {
                showToast('error', result?.message || 'Connection test failed');
            }
        } catch (err: any) {
            showToast('error', err.message || 'Connection test failed');
        } finally {
            setTestingId(null);
        }
    };

    const inputClass = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500';
    const labelClass = 'block text-xs text-gray-600 dark:text-gray-400 mb-1';
    const editInputClass = 'w-full px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-900 dark:text-white font-mono';

    const publishFlags = (p: LdapPublisher) => {
        const flags: string[] = [];
        if (p.publishCaCertificate) flags.push('CA Cert');
        if (p.publishCrl) flags.push('CRL');
        if (p.publishDeltaCrl) flags.push('Delta');
        if (p.publishUserCertificates) flags.push('User Certs');
        return flags.length > 0 ? flags.join(', ') : 'None';
    };

    /// <summary>
    /// Renders a toggle checkbox used in both create and edit forms for LDAP publisher configuration.
    /// </summary>
    const ToggleField: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; small?: boolean }> = ({ label, checked, onChange, small }) => (
        <label className={`flex items-center gap-2 cursor-pointer ${small ? 'text-xs' : 'text-sm'}`}>
            <div
                onClick={() => onChange(!checked)}
                className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${checked ? 'bg-blue-600' : 'bg-gray-400 dark:bg-gray-600'}`}
            >
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-gray-700 dark:text-gray-300">{label}</span>
        </label>
    );

    /// <summary>
    /// Renders the create/edit form fields for an LDAP publisher using the provided state and setter.
    /// </summary>
    const renderFormFields = (f: typeof defaultForm, setF: (v: typeof defaultForm) => void, isEdit: boolean) => (
        <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                    <label className={labelClass}>Name *</label>
                    <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
                        placeholder="Production LDAP" className={isEdit ? editInputClass : inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Host *</label>
                    <input type="text" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })}
                        placeholder="ldap.example.com" className={isEdit ? editInputClass : inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Port</label>
                    <input type="text" inputMode="numeric" value={f.port}
                        onChange={(e) => setF({ ...f, port: e.target.value.replace(/\D/g, '') })}
                        placeholder="389" className={isEdit ? editInputClass : inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Username</label>
                    <input type="text" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })}
                        placeholder="cn=admin,dc=example,dc=com" className={isEdit ? editInputClass : inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Password</label>
                    <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
                        placeholder={isEdit ? '(unchanged)' : ''} className={isEdit ? editInputClass : inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Base DN *</label>
                    <input type="text" value={f.baseDn} onChange={(e) => setF({ ...f, baseDn: e.target.value })}
                        placeholder="dc=example,dc=com" className={isEdit ? editInputClass : inputClass} />
                </div>
                <div className="md:col-span-2">
                    <label className={labelClass}>User DN Template</label>
                    <input type="text" value={f.userDnTemplate} onChange={(e) => setF({ ...f, userDnTemplate: e.target.value })}
                        placeholder="uid={email},ou=People,{baseDn}" className={isEdit ? editInputClass : inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Update Interval (cron)</label>
                    <input type="text" value={f.updateInterval} onChange={(e) => setF({ ...f, updateInterval: e.target.value })}
                        placeholder="0 */6 * * *" className={`${isEdit ? editInputClass : inputClass} font-mono`} />
                </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-2">
                <ToggleField label="Use SSL" checked={f.useSsl} onChange={(v) => setF({ ...f, useSsl: v })} small={isEdit} />
                <ToggleField label="Enabled" checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} small={isEdit} />
            </div>
            <div className="pt-2">
                <span className={`${labelClass} mb-2`}>Publish Options</span>
                <div className="flex flex-wrap gap-4">
                    <label className={`flex items-center gap-1.5 ${isEdit ? 'text-xs' : 'text-sm'} text-gray-700 dark:text-gray-300 cursor-pointer`}>
                        <input type="checkbox" checked={f.publishCaCertificate} onChange={(e) => setF({ ...f, publishCaCertificate: e.target.checked })}
                            className="rounded border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                        CA Certificate
                    </label>
                    <label className={`flex items-center gap-1.5 ${isEdit ? 'text-xs' : 'text-sm'} text-gray-700 dark:text-gray-300 cursor-pointer`}>
                        <input type="checkbox" checked={f.publishCrl} onChange={(e) => setF({ ...f, publishCrl: e.target.checked })}
                            className="rounded border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                        CRL
                    </label>
                    <label className={`flex items-center gap-1.5 ${isEdit ? 'text-xs' : 'text-sm'} text-gray-700 dark:text-gray-300 cursor-pointer`}>
                        <input type="checkbox" checked={f.publishDeltaCrl} onChange={(e) => setF({ ...f, publishDeltaCrl: e.target.checked })}
                            className="rounded border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                        Delta CRL
                    </label>
                    <label className={`flex items-center gap-1.5 ${isEdit ? 'text-xs' : 'text-sm'} text-gray-700 dark:text-gray-300 cursor-pointer`}>
                        <input type="checkbox" checked={f.publishUserCertificates} onChange={(e) => setF({ ...f, publishUserCertificates: e.target.checked })}
                            className="rounded border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                        User Certificates
                    </label>
                </div>
            </div>
        </div>
    );

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Link to="/authorities/manage"
                    className="text-sm text-blue-500 hover:text-blue-400 transition-colors">
                    &larr; CA Management
                </Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                LDAP Publishers{caName ? ` for ${caName}` : ''}
            </h1>

            {/* Create Form */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Publishers</h2>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors">
                    {showCreate ? 'Cancel' : 'Add Publisher'}
                </button>
            </div>

            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New LDAP Publisher</h4>
                    {renderFormFields(form, setForm, false)}
                    <button onClick={handleCreate} disabled={creating || !form.name.trim() || !form.host.trim() || !form.baseDn.trim()}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}

            {/* Publisher List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && publishers.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No LDAP publishers configured for this CA</div>
                )}
                {!loading && !error && publishers.map((p) => {
                    const key = p.id;
                    const expanded = expandedKey === key;
                    return (
                        <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                            <button onClick={() => setExpandedKey(expanded ? null : key)}
                                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors">
                                <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                <StatusBadge status={p.enabled ? 'enabled' : 'disabled'} />
                                <span className="text-sm text-gray-900 dark:text-white font-medium">{p.name}</span>
                                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{p.host}:{p.port}</span>
                                <span className="text-xs text-gray-600 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">{publishFlags(p)}</span>
                                <span className="ml-auto text-xs text-gray-600">Updated: {formatDate(p.lastUpdated)}</span>
                            </button>
                            {expanded && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                    <DetailField label="Name" value={p.name} />
                                    <DetailField label="Host" value={`${p.host}:${p.port}`} mono />
                                    <DetailField label="Use SSL" value={p.useSsl ? 'Yes' : 'No'} />
                                    <DetailField label="Username" value={p.username || '-'} />
                                    <DetailField label="Base DN" value={p.baseDn} mono />
                                    <DetailField label="User DN Template" value={p.userDnTemplate || '-'} mono />
                                    <DetailField label="Update Interval" value={p.updateInterval || '-'} mono />
                                    <DetailField label="Enabled" value={p.enabled ? 'Yes' : 'No'} />
                                    <DetailField label="Last Updated" value={formatDate(p.lastUpdated)} />
                                    <DetailField label="Next Update" value={formatDate(p.nextUpdate)} />
                                    <DetailField label="Publish" value={publishFlags(p)} />

                                    {editingId === p.id ? (
                                        <div className="mt-3 p-3 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded space-y-2">
                                            {renderFormFields(editForm, setEditForm, true)}
                                            <div className="flex gap-2 pt-2">
                                                <button onClick={() => handleSaveEdit(p)} disabled={saving}
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
                                        <div className="flex gap-2 mt-3">
                                            <button onClick={() => startEdit(p)}
                                                className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                                Edit
                                            </button>
                                            <button onClick={() => handleTest(p)} disabled={testingId === p.id}
                                                className="px-3 py-1 text-xs bg-indigo-900/50 text-indigo-300 border border-indigo-700 rounded hover:bg-indigo-900 disabled:opacity-50 transition-colors">
                                                {testingId === p.id ? 'Testing...' : 'Test Connection'}
                                            </button>
                                            <button onClick={() => handleDelete(p)}
                                                className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors">
                                                Delete
                                            </button>
                                        </div>
                                    )}
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

export default LdapPublishers;
