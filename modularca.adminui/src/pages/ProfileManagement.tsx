import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, apiPutWithMfa, apiDeleteWithMfa } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

import RequestProfilesTab from './RequestProfiles';

const TABS = ['Certificate Profiles', 'Signing Profiles', 'Request Profiles', 'SSH Signing', 'SSH Cert', 'SSH Request'] as const;
type Tab = typeof TABS[number];

const KEY_USAGE_OPTIONS = [
    'Digital Signature', 'Key Encipherment', 'Key Cert Sign', 'CRL Sign',
];
const EKU_OPTIONS = [
    'Server Auth', 'Client Auth', 'Code Signing', 'Email Protection', 'Time Stamping', 'OCSP Signing',
];

const ALLOWED_KEY_ALGORITHM_OPTIONS = [
    'RSA', 'ECDSA', 'Ed25519', 'Ed448', 'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-SHA2-128F',
];
const ALLOWED_KEY_SIZE_OPTIONS = [
    '2048', '3072', '4096', '7680', '8192', 'P-256', 'P-384', 'P-521',
];
const ALLOWED_SIGNATURE_ALGORITHM_OPTIONS = [
    'SHA256withRSA', 'SHA384withRSA', 'SHA512withRSA',
    'SHA256withECDSA', 'SHA384withECDSA', 'SHA512withECDSA',
    'Ed25519', 'Ed448',
    'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-SHA2-128F',
];

const SIGNING_ALLOWED_ALGORITHM_OPTIONS = ['RSA', 'ECDSA', 'Ed25519', 'Ed448', 'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87', 'SLH-DSA-SHA2-128F'];

/** Common EKU OIDs with display names for signing profile EKU picker */
const SIGNING_EKU_OPTIONS: { oid: string; label: string }[] = [
    { oid: '1.3.6.1.5.5.7.3.1', label: 'Server Auth' },
    { oid: '1.3.6.1.5.5.7.3.2', label: 'Client Auth' },
    { oid: '1.3.6.1.5.5.7.3.3', label: 'Code Signing' },
    { oid: '1.3.6.1.5.5.7.3.4', label: 'Email Protection' },
    { oid: '1.3.6.1.5.5.7.3.8', label: 'Time Stamping' },
    { oid: '1.3.6.1.5.5.7.3.9', label: 'OCSP Signing' },
];

const inputClass = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500';
const labelClass = 'block text-xs text-gray-600 dark:text-gray-400 mb-1';

/** Parse a JSON array field from the API (could be string or array) into a string array */
const parseJsonArray = (val: any): string[] => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed.map(String) : []; }
        catch { return []; }
    }
    return [];
};

/** Render an array (or JSON string) as comma-separated badges */
const BadgeList: React.FC<{ items: any }> = ({ items }) => {
    const arr = parseJsonArray(items);
    if (arr.length === 0) return <span className="text-gray-600 text-xs">None</span>;
    return (
        <div className="flex flex-wrap gap-1">
            {arr.map((v, i) => (
                <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">{v}</span>
            ))}
        </div>
    );
};

/** Multi-select toggle buttons for an array field */
const MultiToggle: React.FC<{
    options: string[];
    selected: string[];
    onChange: (next: string[]) => void;
    formatLabel?: (opt: string) => string;
}> = ({ options, selected, onChange, formatLabel }) => (
    <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
            const active = selected.includes(opt);
            return (
                <button key={opt} type="button"
                    onClick={() => onChange(active ? selected.filter((v) => v !== opt) : [...selected, opt])}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-gray-500'}`}>
                    {formatLabel ? formatLabel(opt) : opt}
                </button>
            );
        })}
    </div>
);

/** Decorates RSA 7680 / 8192 with a "(high compute)" hint so profile authors and
 *  cert requesters know those sizes carry significant keygen overhead. */
const formatKeySizeLabel = (size: string) =>
    (size === '7680' || size === '8192') ? `${size} (high compute)` : size;

/** Field source indicator for resolved profile views */
const FieldSourceBadge: React.FC<{ source?: string }> = ({ source }) => {
    if (!source) return null;
    const isOverridden = source === 'overridden';
    return (
        <span className={`ml-2 px-1.5 py-0.5 text-[10px] rounded border ${
            isOverridden
                ? 'bg-green-50 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700'
                : 'bg-gray-200 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 border-gray-400 dark:border-gray-600'
        }`}>
            {isOverridden ? 'overridden' : 'inherited'}
        </span>
    );
};

/** Wrapper that adds a colored left border based on field source */
const SourceBorderedField: React.FC<{ source?: string; label: string; value?: string | null }> = ({ source, label, value }) => {
    const borderColor = source === 'overridden' ? 'border-l-green-500' : source === 'inherited' ? 'border-l-gray-500' : '';
    return (
        <div className={`pl-3 border-l-2 ${borderColor}`}>
            <div className="flex items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                <FieldSourceBadge source={source} />
            </div>
            <span className="text-sm text-gray-900 dark:text-white">{value || '-'}</span>
        </div>
    );
};

/* ─── Certificate Profiles Tab ─── */
const CertProfilesTab: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [authorities, setAuthorities] = useState<any[]>([]);
    const [resolvedProfile, setResolvedProfile] = useState<any | null>(null);
    const [resolvedLoading, setResolvedLoading] = useState(false);
    const [validationResult, setValidationResult] = useState<{ isValid: boolean; errors: string[] } | null>(null);
    const [validationLoading, setValidationLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '', description: '', isCaProfile: false,
        keyUsages: [] as string[], extendedKeyUsages: [] as string[],
        allowedKeyAlgorithms: [] as string[], allowedKeySizes: [] as string[],
        allowedSignatureAlgorithms: [] as string[],
        validityPeriodMin: '', validityPeriodMax: '',
        ctEnabled: false, ctLogIds: '',
        inheritsFromId: '', inheritanceEnabled: false, certificateAuthorityId: '',
        allowWildcard: false,
    });
    const [form, setForm] = useState({
        name: '',
        description: '',
        isCaProfile: false,
        keyUsages: [] as string[],
        extendedKeyUsages: [] as string[],
        allowedKeyAlgorithms: [] as string[],
        allowedKeySizes: [] as string[],
        allowedSignatureAlgorithms: [] as string[],
        validityPeriodMin: '',
        validityPeriodMax: '',
        ctEnabled: false,
        ctLogIds: '',
        inheritsFromId: '',
        inheritanceEnabled: false,
        certificateAuthorityId: '',
        allowWildcard: false,
    });

    const resetForm = () => setForm({
        name: '', description: '', isCaProfile: false,
        keyUsages: [], extendedKeyUsages: [],
        allowedKeyAlgorithms: [], allowedKeySizes: [], allowedSignatureAlgorithms: [],
        validityPeriodMin: '', validityPeriodMax: '',
        ctEnabled: false, ctLogIds: '',
        inheritsFromId: '', inheritanceEnabled: false, certificateAuthorityId: '',
        allowWildcard: false,
    });

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/cert-profiles')
            .then((data) => setProfiles(Array.isArray(data) ? data : (data.items || data.profiles || [])))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        apiGet<any>('/api/v1/admin/authorities')
            .then((data) => setAuthorities(Array.isArray(data) ? data : (data.items || data.authorities || [])))
            .catch(() => {});
    }, []);

    /** Resolve parent profile name from ID */
    const resolveParentName = (id: string | undefined | null) => {
        if (!id) return undefined;
        const p = profiles.find((pr) => (pr.id || pr.certProfileId) === id);
        return p ? p.name : id;
    };

    /** Fetch the resolved (merged) profile for a given cert profile */
    const fetchResolvedProfile = async (profileId: string) => {
        setResolvedLoading(true);
        setResolvedProfile(null);
        try {
            const data = await apiGet<any>(`/api/v1/admin/cert-profiles/${profileId}/resolved`);
            setResolvedProfile(data);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to fetch resolved profile');
        } finally {
            setResolvedLoading(false);
        }
    };

    /** Validate inheritance constraints for a given cert profile */
    const fetchValidation = async (profileId: string) => {
        setValidationLoading(true);
        setValidationResult(null);
        try {
            const data = await apiPost<any>(`/api/v1/admin/cert-profiles/${profileId}/validate-inheritance`, {});
            setValidationResult(data);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to validate inheritance');
        } finally {
            setValidationLoading(false);
        }
    };

    const handleCreate = async () => {
        setCreating(true);
        try {
            const body = {
                ...form,
                keyUsages: form.keyUsages.join(', '),
                extendedKeyUsages: form.extendedKeyUsages.join(', '),
                allowedKeyAlgorithms: JSON.stringify(form.allowedKeyAlgorithms),
                allowedKeySizes: JSON.stringify(form.allowedKeySizes),
                allowedSignatureAlgorithms: JSON.stringify(form.allowedSignatureAlgorithms),
                ctLogIds: form.ctLogIds || undefined,
                validityPeriodMin: form.validityPeriodMin || undefined,
                validityPeriodMax: form.validityPeriodMax || undefined,
                inheritsFromId: form.inheritsFromId || undefined,
                inheritanceEnabled: form.inheritanceEnabled,
                certificateAuthorityId: form.certificateAuthorityId || undefined,
                allowWildcard: form.allowWildcard,
            };
            await apiPost('/api/v1/admin/cert-profiles', body);
            setShowCreate(false);
            resetForm();
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create profile');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (profile: any) => {
        if (!window.confirm(`Delete certificate profile "${profile.name}"?`)) return;
        try {
            const profileId = profile.id || profile.certProfileId;
            await apiDeleteWithMfa(`/api/v1/admin/cert-profiles/${profileId}`, requireStepUp, 'delete-cert-profile', profileId);
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to delete profile');
        }
    };

    /** Populate edit form from an existing profile and enter edit mode */
    const startEdit = (p: any) => {
        const id = p.id || p.certProfileId;
        setEditForm({
            name: p.name || '',
            description: p.description || '',
            isCaProfile: !!p.isCaProfile,
            keyUsages: typeof p.keyUsages === 'string' ? p.keyUsages.split(',').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(p.keyUsages) ? p.keyUsages : []),
            extendedKeyUsages: typeof p.extendedKeyUsages === 'string' ? p.extendedKeyUsages.split(',').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(p.extendedKeyUsages) ? p.extendedKeyUsages : []),
            allowedKeyAlgorithms: parseJsonArray(p.allowedKeyAlgorithms),
            allowedKeySizes: parseJsonArray(p.allowedKeySizes),
            allowedSignatureAlgorithms: parseJsonArray(p.allowedSignatureAlgorithms),
            validityPeriodMin: p.validityPeriodMin || '',
            validityPeriodMax: p.validityPeriodMax || '',
            ctEnabled: !!p.ctEnabled,
            ctLogIds: p.ctLogIds || '',
            inheritsFromId: p.inheritsFromId || '',
            inheritanceEnabled: !!p.inheritanceEnabled,
            certificateAuthorityId: p.certificateAuthorityId || '',
            allowWildcard: !!p.allowWildcard,
        });
        setEditingId(id);
    };

    /** Save edited cert profile via step-up MFA */
    const handleSaveEdit = async (profileId: string) => {
        setSaving(true);
        try {
            const body = {
                ...editForm,
                keyUsages: editForm.keyUsages.join(', '),
                extendedKeyUsages: editForm.extendedKeyUsages.join(', '),
                allowedKeyAlgorithms: JSON.stringify(editForm.allowedKeyAlgorithms),
                allowedKeySizes: JSON.stringify(editForm.allowedKeySizes),
                allowedSignatureAlgorithms: JSON.stringify(editForm.allowedSignatureAlgorithms),
                ctLogIds: editForm.ctLogIds || undefined,
                validityPeriodMin: editForm.validityPeriodMin || undefined,
                validityPeriodMax: editForm.validityPeriodMax || undefined,
                inheritsFromId: editForm.inheritsFromId || undefined,
                inheritanceEnabled: editForm.inheritanceEnabled,
                certificateAuthorityId: editForm.certificateAuthorityId || undefined,
                allowWildcard: editForm.allowWildcard,
            };
            await apiPutWithMfa(
                `/api/v1/admin/cert-profiles/${profileId}`,
                body,
                requireStepUp,
                'update-cert-profile',
                profileId,
            );
            setEditingId(null);
            load();
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to update profile');
            }
        } finally {
            setSaving(false);
        }
    };

    /** Parse a comma-separated string or array into a display string */
    const displayCommaSep = (val: any): string => {
        if (Array.isArray(val)) return val.join(', ');
        if (typeof val === 'string') return val;
        return '';
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Certificate Profiles</h3>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors"
                >
                    {showCreate ? 'Cancel' : 'Create Profile'}
                </button>
            </div>

            {/* Create Form */}
            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New Certificate Profile</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Name</label>
                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Description</label>
                            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Validity Period Min (ISO 8601)</label>
                            <input type="text" placeholder='e.g. P90D' value={form.validityPeriodMin} onChange={(e) => setForm({ ...form, validityPeriodMin: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Validity Period Max (ISO 8601)</label>
                            <input type="text" placeholder='e.g. P1Y' value={form.validityPeriodMax} onChange={(e) => setForm({ ...form, validityPeriodMax: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>CT Log IDs</label>
                            <input type="text" placeholder="Comma-separated log IDs" value={form.ctLogIds} onChange={(e) => setForm({ ...form, ctLogIds: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Inherits From</label>
                            <select value={form.inheritsFromId} onChange={(e) => setForm({ ...form, inheritsFromId: e.target.value })} className={inputClass}>
                                <option value="">-- None (standalone) --</option>
                                {profiles.map((pr) => {
                                    const prId = pr.id || pr.certProfileId;
                                    return <option key={prId} value={prId}>{pr.name}</option>;
                                })}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>CA Scope</label>
                            <select value={form.certificateAuthorityId} onChange={(e) => setForm({ ...form, certificateAuthorityId: e.target.value })} className={inputClass}>
                                <option value="">-- System-wide --</option>
                                {authorities.map((a) => (
                                    <option key={a.certificateId || a.id} value={a.certificateId || a.id}>
                                        {a.name || a.commonName || a.label || a.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.isCaProfile} onChange={(e) => setForm({ ...form, isCaProfile: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            CA Profile
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.ctEnabled} onChange={(e) => setForm({ ...form, ctEnabled: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            CT Enabled
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.inheritanceEnabled} onChange={(e) => setForm({ ...form, inheritanceEnabled: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Enable Inheritance
                        </label>
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.allowWildcard} onChange={(e) => setForm({ ...form, allowWildcard: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Allow wildcard SAN/CN entries
                        </label>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 ml-6">
                            When disabled, any DNS SAN or CN containing <code className="font-mono">*</code> is rejected at issuance.
                            Structural rules still apply when enabled: at most one <code className="font-mono">*</code>, in the
                            leftmost label, and the name must have at least two labels.
                        </p>
                    </div>
                    <div>
                        <label className={labelClass}>Key Usages</label>
                        <MultiToggle options={KEY_USAGE_OPTIONS} selected={form.keyUsages}
                            onChange={(next) => setForm({ ...form, keyUsages: next })} />
                    </div>
                    <div>
                        <label className={labelClass}>Extended Key Usages</label>
                        <MultiToggle options={EKU_OPTIONS} selected={form.extendedKeyUsages}
                            onChange={(next) => setForm({ ...form, extendedKeyUsages: next })} />
                    </div>
                    <div>
                        <label className={labelClass}>Allowed Key Algorithms</label>
                        <MultiToggle options={ALLOWED_KEY_ALGORITHM_OPTIONS} selected={form.allowedKeyAlgorithms}
                            onChange={(next) => setForm({ ...form, allowedKeyAlgorithms: next })} />
                    </div>
                    <div>
                        <label className={labelClass}>Allowed Key Sizes</label>
                        <MultiToggle options={ALLOWED_KEY_SIZE_OPTIONS} selected={form.allowedKeySizes}
                            onChange={(next) => setForm({ ...form, allowedKeySizes: next })}
                            formatLabel={formatKeySizeLabel} />
                    </div>
                    <div>
                        <label className={labelClass}>Allowed Signature Algorithms</label>
                        <MultiToggle options={ALLOWED_SIGNATURE_ALGORITHM_OPTIONS} selected={form.allowedSignatureAlgorithms}
                            onChange={(next) => setForm({ ...form, allowedSignatureAlgorithms: next })} />
                    </div>
                    <button onClick={handleCreate} disabled={creating || !form.name}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}

            {/* Profile List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && profiles.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No certificate profiles found</div>
                )}
                {!loading && !error && profiles.map((p) => {
                    const key = p.id || p.certProfileId || p.name;
                    const expanded = expandedKey === key;
                    return (
                        <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                            <button onClick={() => { setExpandedKey(expanded ? null : key); setResolvedProfile(null); setValidationResult(null); }}
                                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors">
                                <span className="text-gray-600 text-xs">{expanded ? '▼' : '▶'}</span>
                                <span className="text-sm text-gray-900 dark:text-white font-medium">{p.name}</span>
                                <StatusBadge status={p.isCaProfile ? 'active' : 'enabled'} label={p.isCaProfile ? 'CA' : 'Leaf'} />
                                {p.ctEnabled && <StatusBadge status="active" label="CT" />}
                                {p.inheritanceEnabled && p.inheritsFromId && (
                                    <span className="px-2 py-0.5 text-[10px] rounded bg-purple-900/40 text-purple-300 border border-purple-700 flex items-center gap-1">
                                        Inherits: {resolveParentName(p.inheritsFromId)}
                                    </span>
                                )}
                                <span className="ml-auto text-xs text-gray-600">
                                    {p.validityPeriodMin || p.validityPeriodMax
                                        ? `${p.validityPeriodMin || '?'} – ${p.validityPeriodMax || '?'}`
                                        : '-'}
                                </span>
                            </button>
                            {expanded && editingId === key && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Edit Certificate Profile</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelClass}>Name</label>
                                            <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Description</label>
                                            <input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Validity Period Min (ISO 8601)</label>
                                            <input type="text" placeholder="e.g. P90D" value={editForm.validityPeriodMin} onChange={(e) => setEditForm({ ...editForm, validityPeriodMin: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Validity Period Max (ISO 8601)</label>
                                            <input type="text" placeholder="e.g. P1Y" value={editForm.validityPeriodMax} onChange={(e) => setEditForm({ ...editForm, validityPeriodMax: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>CT Log IDs</label>
                                            <input type="text" placeholder="Comma-separated log IDs" value={editForm.ctLogIds} onChange={(e) => setEditForm({ ...editForm, ctLogIds: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Inherits From</label>
                                            <select value={editForm.inheritsFromId} onChange={(e) => setEditForm({ ...editForm, inheritsFromId: e.target.value })} className={inputClass}>
                                                <option value="">-- None (standalone) --</option>
                                                {profiles.filter(pr => (pr.id || pr.certProfileId) !== key).map((pr) => {
                                                    const prId = pr.id || pr.certProfileId;
                                                    return <option key={prId} value={prId}>{pr.name}</option>;
                                                })}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClass}>CA Scope</label>
                                            <select value={editForm.certificateAuthorityId} onChange={(e) => setEditForm({ ...editForm, certificateAuthorityId: e.target.value })} className={inputClass}>
                                                <option value="">-- System-wide --</option>
                                                {authorities.map((a) => (
                                                    <option key={a.certificateId || a.id} value={a.certificateId || a.id}>
                                                        {a.name || a.commonName || a.label || a.id}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                            <input type="checkbox" checked={editForm.isCaProfile} onChange={(e) => setEditForm({ ...editForm, isCaProfile: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                            CA Profile
                                        </label>
                                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                            <input type="checkbox" checked={editForm.ctEnabled} onChange={(e) => setEditForm({ ...editForm, ctEnabled: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                            CT Enabled
                                        </label>
                                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                            <input type="checkbox" checked={editForm.inheritanceEnabled} onChange={(e) => setEditForm({ ...editForm, inheritanceEnabled: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                            Enable Inheritance
                                        </label>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                            <input type="checkbox" checked={editForm.allowWildcard} onChange={(e) => setEditForm({ ...editForm, allowWildcard: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                            Allow wildcard SAN/CN entries
                                        </label>
                                        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 ml-6">
                                            When disabled, any DNS SAN or CN containing <code className="font-mono">*</code> is rejected at issuance.
                                            Structural rules still apply when enabled: at most one <code className="font-mono">*</code>, in the
                                            leftmost label, and the name must have at least two labels.
                                        </p>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Key Usages</label>
                                        <MultiToggle options={KEY_USAGE_OPTIONS} selected={editForm.keyUsages}
                                            onChange={(next) => setEditForm({ ...editForm, keyUsages: next })} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Extended Key Usages</label>
                                        <MultiToggle options={EKU_OPTIONS} selected={editForm.extendedKeyUsages}
                                            onChange={(next) => setEditForm({ ...editForm, extendedKeyUsages: next })} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Allowed Key Algorithms</label>
                                        <MultiToggle options={ALLOWED_KEY_ALGORITHM_OPTIONS} selected={editForm.allowedKeyAlgorithms}
                                            onChange={(next) => setEditForm({ ...editForm, allowedKeyAlgorithms: next })} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Allowed Key Sizes</label>
                                        <MultiToggle options={ALLOWED_KEY_SIZE_OPTIONS} selected={editForm.allowedKeySizes}
                                            onChange={(next) => setEditForm({ ...editForm, allowedKeySizes: next })}
                                            formatLabel={formatKeySizeLabel} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Allowed Signature Algorithms</label>
                                        <MultiToggle options={ALLOWED_SIGNATURE_ALGORITHM_OPTIONS} selected={editForm.allowedSignatureAlgorithms}
                                            onChange={(next) => setEditForm({ ...editForm, allowedSignatureAlgorithms: next })} />
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={() => handleSaveEdit(key)} disabled={saving || !editForm.name}
                                            className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                        <button onClick={() => setEditingId(null)}
                                            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            {expanded && editingId !== key && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-1">
                                    <DetailField label="Name" value={p.name} />
                                    <DetailField label="Description" value={p.description} />
                                    <DetailField label="Type" value={p.isCaProfile ? 'CA Profile' : 'Leaf Profile'} />
                                    <DetailField label="Key Usages" value={displayCommaSep(p.keyUsages)} />
                                    <DetailField label="Extended Key Usages" value={displayCommaSep(p.extendedKeyUsages)} />
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Key Algorithms</span>
                                        <BadgeList items={p.allowedKeyAlgorithms} />
                                    </div>
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Key Sizes</span>
                                        <BadgeList items={p.allowedKeySizes} />
                                    </div>
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Signature Algorithms</span>
                                        <BadgeList items={p.allowedSignatureAlgorithms} />
                                    </div>
                                    <DetailField label="Validity Period Min" value={p.validityPeriodMin} />
                                    <DetailField label="Validity Period Max" value={p.validityPeriodMax} />
                                    <DetailField label="CT Enabled" value={p.ctEnabled ? 'Yes' : 'No'} />
                                    <DetailField label="CT Log IDs" value={p.ctLogIds} />
                                    <DetailField label="Allow Wildcard SAN/CN" value={p.allowWildcard ? 'Yes' : 'No'} />
                                    {p.inheritanceEnabled && (
                                        <DetailField label="Inherits From" value={resolveParentName(p.inheritsFromId) || 'None'} />
                                    )}
                                    <DetailField label="CA Scope" value={p.certificateAuthorityId ? String(p.certificateAuthorityId) : 'System-wide'} />

                                    {/* Inheritance actions */}
                                    {p.inheritanceEnabled && p.inheritsFromId && (
                                        <div className="mt-3 space-y-3">
                                            <div className="flex gap-2">
                                                <button onClick={() => fetchResolvedProfile(p.id || p.certProfileId)}
                                                    disabled={resolvedLoading}
                                                    className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors disabled:opacity-50">
                                                    {resolvedLoading ? 'Loading...' : 'Resolved Profile'}
                                                </button>
                                                <button onClick={() => fetchValidation(p.id || p.certProfileId)}
                                                    disabled={validationLoading}
                                                    className="px-3 py-1 text-xs bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700 rounded hover:bg-yellow-900 transition-colors disabled:opacity-50">
                                                    {validationLoading ? 'Validating...' : 'Validate Inheritance'}
                                                </button>
                                            </div>

                                            {/* Validation results */}
                                            {validationResult && (
                                                <div className={`p-3 rounded border text-sm ${
                                                    validationResult.isValid
                                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300'
                                                        : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300'
                                                }`}>
                                                    {validationResult.isValid ? (
                                                        <span>Inheritance is valid. No constraint violations found.</span>
                                                    ) : (
                                                        <div>
                                                            <span className="font-semibold">Validation errors:</span>
                                                            <ul className="mt-1 list-disc list-inside space-y-0.5">
                                                                {validationResult.errors.map((err, i) => (
                                                                    <li key={i} className="text-xs">{err}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Resolved profile display */}
                                            {resolvedProfile && (
                                                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3 space-y-2">
                                                    <h5 className="text-xs font-semibold text-gray-900 dark:text-white mb-2">Resolved (Effective) Profile</h5>
                                                    {resolvedProfile.parentProfileId && (
                                                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                                            Parent: {resolveParentName(resolvedProfile.parentProfileId)}
                                                        </div>
                                                    )}
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.Name} label="Name" value={resolvedProfile.name} />
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.Description} label="Description" value={resolvedProfile.description} />
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.IsCaProfile} label="CA Profile" value={resolvedProfile.isCaProfile ? 'Yes' : 'No'} />
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.KeyUsages} label="Key Usages" value={resolvedProfile.keyUsages} />
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.ExtendedKeyUsages} label="Extended Key Usages" value={resolvedProfile.extendedKeyUsages} />
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.ValidityPeriodMin} label="Validity Period Min" value={resolvedProfile.validityPeriodMin} />
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.ValidityPeriodMax} label="Validity Period Max" value={resolvedProfile.validityPeriodMax} />
                                                    <div className={`pl-3 border-l-2 ${resolvedProfile.fieldSources?.AllowedKeyAlgorithms === 'overridden' ? 'border-l-green-500' : 'border-l-gray-500'}`}>
                                                        <div className="flex items-center">
                                                            <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Key Algorithms</span>
                                                            <FieldSourceBadge source={resolvedProfile.fieldSources?.AllowedKeyAlgorithms} />
                                                        </div>
                                                        <BadgeList items={resolvedProfile.allowedKeyAlgorithms} />
                                                    </div>
                                                    <div className={`pl-3 border-l-2 ${resolvedProfile.fieldSources?.AllowedKeySizes === 'overridden' ? 'border-l-green-500' : 'border-l-gray-500'}`}>
                                                        <div className="flex items-center">
                                                            <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Key Sizes</span>
                                                            <FieldSourceBadge source={resolvedProfile.fieldSources?.AllowedKeySizes} />
                                                        </div>
                                                        <BadgeList items={resolvedProfile.allowedKeySizes} />
                                                    </div>
                                                    <div className={`pl-3 border-l-2 ${resolvedProfile.fieldSources?.AllowedSignatureAlgorithms === 'overridden' ? 'border-l-green-500' : 'border-l-gray-500'}`}>
                                                        <div className="flex items-center">
                                                            <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Signature Algorithms</span>
                                                            <FieldSourceBadge source={resolvedProfile.fieldSources?.AllowedSignatureAlgorithms} />
                                                        </div>
                                                        <BadgeList items={resolvedProfile.allowedSignatureAlgorithms} />
                                                    </div>
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.CtEnabled} label="CT Enabled" value={resolvedProfile.ctEnabled ? 'Yes' : 'No'} />
                                                    <SourceBorderedField source={resolvedProfile.fieldSources?.CtLogIds} label="CT Log IDs" value={resolvedProfile.ctLogIds} />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-3 flex gap-2">
                                        <button onClick={() => startEdit(p)}
                                            className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                            Edit
                                        </button>
                                        <button onClick={() => handleDelete(p)}
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
        </div>
    );
};

/* ─── Signing Profiles Tab ─── */
const SigningProfilesTab: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [authorities, setAuthorities] = useState<any[]>([]);
    const [certProfiles, setCertProfiles] = useState<any[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '', description: '', isDefault: false, issuerId: '',
        allowedAlgorithms: [] as string[], allowedEkus: [] as string[],
        maxPathLength: '', nameConstraintsPermitted: '', nameConstraintsExcluded: '',
        policyOids: '', inhibitAnyPolicy: false,
        inheritsFromId: '', inheritanceEnabled: false,
        extendedKeyUsageCritical: false,
        policyQualifiersJson: '{}',
    });
    const [form, setForm] = useState({
        name: '',
        description: '',
        isDefault: false,
        issuerId: '',
        allowedAlgorithms: [] as string[],
        allowedEkus: [] as string[],
        maxPathLength: '',
        nameConstraintsPermitted: '',
        nameConstraintsExcluded: '',
        policyOids: '',
        inhibitAnyPolicy: false,
        allowedCertProfileIds: [] as string[],
        extendedKeyUsageCritical: false,
        policyQualifiersJson: '{}',
    });
    // Client-side validation errors for the policy qualifiers JSON textarea
    const [createPolicyQualifiersError, setCreatePolicyQualifiersError] = useState<string | null>(null);
    const [editPolicyQualifiersError, setEditPolicyQualifiersError] = useState<string | null>(null);

    const resetForm = () => setForm({
        name: '', description: '', isDefault: false, issuerId: '',
        allowedAlgorithms: [], allowedEkus: [] as string[], maxPathLength: '',
        nameConstraintsPermitted: '', nameConstraintsExcluded: '',
        policyOids: '', inhibitAnyPolicy: false, allowedCertProfileIds: [],
        extendedKeyUsageCritical: false, policyQualifiersJson: '{}',
    });

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/signing-profiles')
            .then((data) => setProfiles(Array.isArray(data) ? data : (data.items || data.profiles || [])))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        apiGet<any>('/api/v1/admin/authorities')
            .then((data) => setAuthorities(Array.isArray(data) ? data : (data.items || data.authorities || [])))
            .catch(() => {});
        apiGet<any>('/api/v1/admin/cert-profiles')
            .then((data) => setCertProfiles(Array.isArray(data) ? data : (data.items || data.profiles || [])))
            .catch(() => {});
    }, []);

    /** Load allowed cert profile IDs for a specific signing profile */
    const loadAllowedCertProfiles = async (signingProfileId: string): Promise<string[]> => {
        try {
            const data = await apiGet<any>(`/api/v1/admin/signing-profiles/${signingProfileId}/allowed-cert-profiles`);
            return Array.isArray(data) ? data.map((x: any) => x.id || x.certProfileId || x) : [];
        } catch {
            return [];
        }
    };

    const handleCreate = async () => {
        // Validate policy qualifiers JSON before submit
        setCreatePolicyQualifiersError(null);
        const rawPolicyQualifiers = (form.policyQualifiersJson ?? '').trim();
        if (rawPolicyQualifiers.length > 0) {
            try {
                const parsed = JSON.parse(rawPolicyQualifiers);
                if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    setCreatePolicyQualifiersError('Policy qualifiers must be a JSON object mapping OIDs to qualifiers.');
                    return;
                }
            } catch (err: any) {
                setCreatePolicyQualifiersError(`Invalid JSON: ${err.message || 'parse error'}`);
                return;
            }
        }
        setCreating(true);
        try {
            const body: any = {
                name: form.name,
                description: form.description,
                isDefault: form.isDefault,
                issuerId: form.issuerId || undefined,
                allowedAlgorithms: JSON.stringify(form.allowedAlgorithms),
                allowedEKUs: JSON.stringify(form.allowedEkus),
                maxPathLength: form.maxPathLength ? parseInt(form.maxPathLength) : null,
                nameConstraintsPermitted: form.nameConstraintsPermitted || undefined,
                nameConstraintsExcluded: form.nameConstraintsExcluded || undefined,
                policyOids: JSON.stringify(form.policyOids ? form.policyOids.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
                inhibitAnyPolicy: form.inhibitAnyPolicy,
                extendedKeyUsageCritical: form.extendedKeyUsageCritical,
                policyQualifiersJson: rawPolicyQualifiers.length > 0 ? rawPolicyQualifiers : undefined,
            };
            const created = await apiPost<any>('/api/v1/admin/signing-profiles', body);
            // Link allowed cert profiles via the join endpoint
            if (form.allowedCertProfileIds.length > 0 && created?.id) {
                await apiPut(`/api/v1/admin/signing-profiles/${created.id}/allowed-cert-profiles`, form.allowedCertProfileIds);
            }
            setShowCreate(false);
            resetForm();
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create signing profile');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (profile: any) => {
        if (!window.confirm(`Delete signing profile "${profile.name}"?`)) return;
        try {
            const profileId = profile.id || profile.signingProfileId;
            await apiDeleteWithMfa(`/api/v1/admin/signing-profiles/${profileId}`, requireStepUp, 'delete-signing-profile', profileId);
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to delete signing profile');
        }
    };

    /** Populate edit form from an existing signing profile */
    const startSigningEdit = (p: any) => {
        const id = p.id || p.signingProfileId;
        setEditForm({
            name: p.name || '',
            description: p.description || '',
            isDefault: !!p.isDefault,
            issuerId: p.issuerId || '',
            allowedAlgorithms: parseJsonArray(p.allowedAlgorithms),
            allowedEkus: parseJsonArray(p.allowedEkus),
            maxPathLength: p.maxPathLength != null ? String(p.maxPathLength) : '',
            nameConstraintsPermitted: typeof p.nameConstraintsPermitted === 'object' ? JSON.stringify(p.nameConstraintsPermitted) : (p.nameConstraintsPermitted || ''),
            nameConstraintsExcluded: typeof p.nameConstraintsExcluded === 'object' ? JSON.stringify(p.nameConstraintsExcluded) : (p.nameConstraintsExcluded || ''),
            policyOids: parseJsonArray(p.policyOids).join(', '),
            inhibitAnyPolicy: !!p.inhibitAnyPolicy,
            inheritsFromId: p.inheritsFromId || '',
            inheritanceEnabled: !!p.inheritanceEnabled,
            extendedKeyUsageCritical: !!p.extendedKeyUsageCritical,
            policyQualifiersJson: typeof p.policyQualifiersJson === 'string'
                ? (p.policyQualifiersJson || '{}')
                : (p.policyQualifiersJson ? JSON.stringify(p.policyQualifiersJson, null, 2) : '{}'),
        });
        setEditPolicyQualifiersError(null);
        setEditingId(id);
    };

    /** Save edited signing profile via step-up MFA */
    const handleSaveSigningEdit = async (profileId: string) => {
        // Validate policy qualifiers JSON before submit
        setEditPolicyQualifiersError(null);
        const rawPolicyQualifiers = (editForm.policyQualifiersJson ?? '').trim();
        if (rawPolicyQualifiers.length > 0) {
            try {
                const parsed = JSON.parse(rawPolicyQualifiers);
                if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    setEditPolicyQualifiersError('Policy qualifiers must be a JSON object mapping OIDs to qualifiers.');
                    return;
                }
            } catch (err: any) {
                setEditPolicyQualifiersError(`Invalid JSON: ${err.message || 'parse error'}`);
                return;
            }
        }
        setSaving(true);
        try {
            const body: any = {
                name: editForm.name,
                description: editForm.description,
                isDefault: editForm.isDefault,
                issuerId: editForm.issuerId || undefined,
                allowedAlgorithms: JSON.stringify(editForm.allowedAlgorithms),
                allowedEKUs: JSON.stringify(editForm.allowedEkus),
                maxPathLength: editForm.maxPathLength ? parseInt(editForm.maxPathLength) : null,
                nameConstraintsPermitted: editForm.nameConstraintsPermitted || undefined,
                nameConstraintsExcluded: editForm.nameConstraintsExcluded || undefined,
                policyOids: JSON.stringify(editForm.policyOids ? editForm.policyOids.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
                inhibitAnyPolicy: editForm.inhibitAnyPolicy,
                inheritsFromId: editForm.inheritsFromId || undefined,
                inheritanceEnabled: editForm.inheritanceEnabled,
                extendedKeyUsageCritical: editForm.extendedKeyUsageCritical,
                policyQualifiersJson: rawPolicyQualifiers.length > 0 ? rawPolicyQualifiers : undefined,
            };
            await apiPutWithMfa(
                `/api/v1/admin/signing-profiles/${profileId}`,
                body,
                requireStepUp,
                'update-signing-profile',
                profileId,
            );
            setEditingId(null);
            load();
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to update signing profile');
            }
        } finally {
            setSaving(false);
        }
    };

    /** Resolve authority name from ID */
    const authorityName = (issuerId: string | undefined) => {
        if (!issuerId) return undefined;
        const auth = authorities.find((a) => a.certificateId === issuerId || a.id === issuerId);
        return auth ? auth.name || auth.commonName || issuerId : issuerId;
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Signing Profiles</h3>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors">
                    {showCreate ? 'Cancel' : 'Create Profile'}
                </button>
            </div>

            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New Signing Profile</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Name</label>
                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Description</label>
                            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Issuer</label>
                            <select value={form.issuerId} onChange={(e) => setForm({ ...form, issuerId: e.target.value })} className={inputClass}>
                                <option value="">-- Select Issuing Authority --</option>
                                {authorities.map((a) => (
                                    <option key={a.certificateId || a.id} value={a.certificateId || a.id}>
                                        {a.name || a.commonName || a.label || a.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Max Path Length</label>
                            <input type="text" inputMode="numeric" value={form.maxPathLength} onChange={(e) => setForm({ ...form, maxPathLength: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Name Constraints Permitted (JSON)</label>
                            <input type="text" placeholder='e.g. {"permitted":[".example.com"]}' value={form.nameConstraintsPermitted} onChange={(e) => setForm({ ...form, nameConstraintsPermitted: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Name Constraints Excluded (JSON)</label>
                            <input type="text" placeholder='e.g. {"excluded":[".test.com"]}' value={form.nameConstraintsExcluded} onChange={(e) => setForm({ ...form, nameConstraintsExcluded: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Allowed EKUs</label>
                            <div className="flex flex-wrap gap-2">
                                {SIGNING_EKU_OPTIONS.map((eku) => {
                                    const selected = form.allowedEkus.includes(eku.oid);
                                    return (
                                        <button key={eku.oid} type="button"
                                            onClick={() => setForm({
                                                ...form,
                                                allowedEkus: selected
                                                    ? form.allowedEkus.filter((o: string) => o !== eku.oid)
                                                    : [...form.allowedEkus, eku.oid]
                                            })}
                                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                                                selected
                                                    ? 'bg-blue-600/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-600'
                                                    : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-gray-500'
                                            }`}>
                                            {eku.label} <span className="text-[10px] text-gray-600 ml-1">{eku.oid}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Policy OIDs (comma-separated)</label>
                            <input type="text" placeholder="e.g. 2.23.140.1.2.1" value={form.policyOids} onChange={(e) => setForm({ ...form, policyOids: e.target.value })} className={inputClass} />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Default Profile
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.inhibitAnyPolicy} onChange={(e) => setForm({ ...form, inhibitAnyPolicy: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Inhibit Any Policy
                        </label>
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.extendedKeyUsageCritical} onChange={(e) => setForm({ ...form, extendedKeyUsageCritical: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Mark Extended Key Usage extension as critical
                        </label>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 ml-6">
                            RFC 5280 §4.2.1.12 recommends marking the EKU extension critical when the certificate's
                            purpose is restricted (e.g. a cert that must only be used for client auth).
                        </p>
                    </div>
                    <div>
                        <label className={labelClass}>Policy qualifiers (JSON)</label>
                        <textarea
                            value={form.policyQualifiersJson}
                            onChange={(e) => { setForm({ ...form, policyQualifiersJson: e.target.value }); if (createPolicyQualifiersError) setCreatePolicyQualifiersError(null); }}
                            rows={8}
                            placeholder={'{\n  "2.23.140.1.2.1": {\n    "cpsUri": "https://example.com/cps",\n    "userNotice": "Subscriber agrees to the relying party agreement.",\n    "critical": false\n  }\n}'}
                            className={`${inputClass} font-mono text-xs resize-y`}
                        />
                        {createPolicyQualifiersError && (
                            <p className="text-[11px] text-red-800 dark:text-red-400 mt-1">{createPolicyQualifiersError}</p>
                        )}
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
                            Object mapping each policy OID listed above to its qualifiers. Each entry may include
                            <code className="font-mono"> cpsUri</code>, <code className="font-mono">userNotice</code>, and
                            <code className="font-mono"> critical</code>. Missing OIDs default to no qualifiers, non-critical.
                        </p>
                    </div>
                    <div>
                        <label className={labelClass}>Allowed Algorithms</label>
                        <MultiToggle options={SIGNING_ALLOWED_ALGORITHM_OPTIONS} selected={form.allowedAlgorithms}
                            onChange={(next) => setForm({ ...form, allowedAlgorithms: next })} />
                    </div>
                    <div>
                        <label className={labelClass}>Allowed Cert Profiles</label>
                        <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-2 space-y-1">
                            {certProfiles.length === 0 && <span className="text-xs text-gray-600">No cert profiles available</span>}
                            {certProfiles.map((cp) => {
                                const cpId = cp.id || cp.certProfileId;
                                return (
                                    <label key={cpId} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={form.allowedCertProfileIds.includes(cpId)}
                                            onChange={(e) => {
                                                const updated = e.target.checked
                                                    ? [...form.allowedCertProfileIds, cpId]
                                                    : form.allowedCertProfileIds.filter((id) => id !== cpId);
                                                setForm({ ...form, allowedCertProfileIds: updated });
                                            }}
                                            className="accent-blue-500"
                                        />
                                        <span>{cp.name}</span>
                                        {cp.isCaProfile && <StatusBadge status="active" label="CA" />}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    <button onClick={handleCreate} disabled={creating || !form.name}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && profiles.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No signing profiles found</div>
                )}
                {!loading && !error && profiles.map((p) => {
                    const key = p.id || p.signingProfileId || p.name;
                    const expanded = expandedKey === key;
                    return (
                        <SigningProfileRow key={key} profile={p} expanded={expanded}
                            onToggle={() => setExpandedKey(expanded ? null : key)}
                            onDelete={() => handleDelete(p)}
                            authorityName={authorityName}
                            certProfiles={certProfiles}
                            loadAllowedCertProfiles={loadAllowedCertProfiles}
                            isEditing={editingId === key}
                            editForm={editForm}
                            setEditForm={setEditForm}
                            onStartEdit={() => startSigningEdit(p)}
                            onSaveEdit={() => handleSaveSigningEdit(key)}
                            onCancelEdit={() => { setEditingId(null); setEditPolicyQualifiersError(null); }}
                            saving={saving}
                            authorities={authorities}
                            editPolicyQualifiersError={editPolicyQualifiersError}
                            clearEditPolicyQualifiersError={() => setEditPolicyQualifiersError(null)}
                        />
                    );
                })}
            </div>
        </div>
    );
};

/** Individual signing profile row with lazy-loaded allowed cert profiles */
const SigningProfileRow: React.FC<{
    profile: any;
    expanded: boolean;
    onToggle: () => void;
    onDelete: () => void;
    authorityName: (id: string | undefined) => string | undefined;
    certProfiles: any[];
    loadAllowedCertProfiles: (id: string) => Promise<string[]>;
    isEditing: boolean;
    editForm: any;
    setEditForm: (f: any) => void;
    onStartEdit: () => void;
    onSaveEdit: () => void;
    onCancelEdit: () => void;
    saving: boolean;
    authorities: any[];
    editPolicyQualifiersError: string | null;
    clearEditPolicyQualifiersError: () => void;
}> = ({ profile: p, expanded, onToggle, onDelete, authorityName, certProfiles, loadAllowedCertProfiles,
    isEditing, editForm, setEditForm, onStartEdit, onSaveEdit, onCancelEdit, saving, authorities,
    editPolicyQualifiersError, clearEditPolicyQualifiersError }) => {
    const [allowedCpIds, setAllowedCpIds] = useState<string[] | null>(null);

    useEffect(() => {
        if (expanded && allowedCpIds === null) {
            const id = p.id || p.signingProfileId;
            if (id) loadAllowedCertProfiles(id).then(setAllowedCpIds);
        }
    }, [expanded]);

    const resolvedCpNames = allowedCpIds
        ? allowedCpIds.map((cpId) => {
            const cp = certProfiles.find((c) => (c.id || c.certProfileId) === cpId);
            return cp ? cp.name : cpId;
        })
        : [];

    return (
        <div className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
            <button onClick={onToggle}
                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors">
                <span className="text-gray-600 text-xs">{expanded ? '▼' : '▶'}</span>
                <span className="text-sm text-gray-900 dark:text-white font-medium">{p.name}</span>
                {p.isDefault && <StatusBadge status="active" label="Default" />}
                <span className="text-xs text-gray-600 dark:text-gray-400">{authorityName(p.issuerId) || ''}</span>
                <span className="ml-auto text-xs text-gray-600">
                    {parseJsonArray(p.allowedAlgorithms).join(', ') || '-'}
                </span>
            </button>
            {expanded && isEditing && (
                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Edit Signing Profile</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Name</label>
                            <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Description</label>
                            <input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Issuer</label>
                            <select value={editForm.issuerId} onChange={(e) => setEditForm({ ...editForm, issuerId: e.target.value })} className={inputClass}>
                                <option value="">-- Select Issuing Authority --</option>
                                {authorities.map((a) => (
                                    <option key={a.certificateId || a.id} value={a.certificateId || a.id}>
                                        {a.name || a.commonName || a.label || a.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Max Path Length</label>
                            <input type="text" inputMode="numeric" value={editForm.maxPathLength} onChange={(e) => setEditForm({ ...editForm, maxPathLength: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Name Constraints Permitted (JSON)</label>
                            <input type="text" value={editForm.nameConstraintsPermitted} onChange={(e) => setEditForm({ ...editForm, nameConstraintsPermitted: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Name Constraints Excluded (JSON)</label>
                            <input type="text" value={editForm.nameConstraintsExcluded} onChange={(e) => setEditForm({ ...editForm, nameConstraintsExcluded: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Policy OIDs (comma-separated)</label>
                            <input type="text" value={editForm.policyOids} onChange={(e) => setEditForm({ ...editForm, policyOids: e.target.value })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Allowed EKUs</label>
                            <div className="flex flex-wrap gap-2">
                                {SIGNING_EKU_OPTIONS.map((eku) => {
                                    const selected = editForm.allowedEkus.includes(eku.oid);
                                    return (
                                        <button key={eku.oid} type="button"
                                            onClick={() => setEditForm({
                                                ...editForm,
                                                allowedEkus: selected
                                                    ? editForm.allowedEkus.filter((o: string) => o !== eku.oid)
                                                    : [...editForm.allowedEkus, eku.oid]
                                            })}
                                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                                                selected
                                                    ? 'bg-blue-600/30 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-600'
                                                    : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-gray-500'
                                            }`}>
                                            {eku.label} <span className="text-[10px] text-gray-600 ml-1">{eku.oid}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={editForm.isDefault} onChange={(e) => setEditForm({ ...editForm, isDefault: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Default Profile
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={editForm.inhibitAnyPolicy} onChange={(e) => setEditForm({ ...editForm, inhibitAnyPolicy: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Inhibit Any Policy
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={editForm.inheritanceEnabled} onChange={(e) => setEditForm({ ...editForm, inheritanceEnabled: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Enable Inheritance
                        </label>
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={!!editForm.extendedKeyUsageCritical} onChange={(e) => setEditForm({ ...editForm, extendedKeyUsageCritical: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Mark Extended Key Usage extension as critical
                        </label>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 ml-6">
                            RFC 5280 §4.2.1.12 recommends marking the EKU extension critical when the certificate's
                            purpose is restricted (e.g. a cert that must only be used for client auth).
                        </p>
                    </div>
                    <div>
                        <label className={labelClass}>Policy qualifiers (JSON)</label>
                        <textarea
                            value={editForm.policyQualifiersJson ?? '{}'}
                            onChange={(e) => { setEditForm({ ...editForm, policyQualifiersJson: e.target.value }); if (editPolicyQualifiersError) clearEditPolicyQualifiersError(); }}
                            rows={8}
                            placeholder={'{\n  "2.23.140.1.2.1": {\n    "cpsUri": "https://example.com/cps",\n    "userNotice": "Subscriber agrees to the relying party agreement.",\n    "critical": false\n  }\n}'}
                            className={`${inputClass} font-mono text-xs resize-y`}
                        />
                        {editPolicyQualifiersError && (
                            <p className="text-[11px] text-red-800 dark:text-red-400 mt-1">{editPolicyQualifiersError}</p>
                        )}
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1">
                            Object mapping each policy OID listed above to its qualifiers. Each entry may include
                            <code className="font-mono"> cpsUri</code>, <code className="font-mono">userNotice</code>, and
                            <code className="font-mono"> critical</code>. Missing OIDs default to no qualifiers, non-critical.
                        </p>
                    </div>
                    <div>
                        <label className={labelClass}>Allowed Algorithms</label>
                        <MultiToggle options={SIGNING_ALLOWED_ALGORITHM_OPTIONS} selected={editForm.allowedAlgorithms}
                            onChange={(next) => setEditForm({ ...editForm, allowedAlgorithms: next })} />
                    </div>
                    <div className="flex gap-2 mt-3">
                        <button onClick={onSaveEdit} disabled={saving || !editForm.name}
                            className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={onCancelEdit}
                            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>
            )}
            {expanded && !isEditing && (
                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-1">
                    <DetailField label="Name" value={p.name} />
                    <DetailField label="Description" value={p.description} />
                    <DetailField label="Default" value={p.isDefault ? 'Yes' : 'No'} />
                    <DetailField label="Issuer" value={authorityName(p.issuerId)} />
                    <div className="py-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Algorithms</span>
                        <BadgeList items={p.allowedAlgorithms} />
                    </div>
                    <div className="py-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed EKUs</span>
                        <BadgeList items={p.allowedEkus} />
                    </div>
                    <DetailField label="Max Path Length" value={p.maxPathLength != null ? String(p.maxPathLength) : undefined} />
                    <DetailField label="Name Constraints Permitted" value={typeof p.nameConstraintsPermitted === 'object' ? JSON.stringify(p.nameConstraintsPermitted) : p.nameConstraintsPermitted} />
                    <DetailField label="Name Constraints Excluded" value={typeof p.nameConstraintsExcluded === 'object' ? JSON.stringify(p.nameConstraintsExcluded) : p.nameConstraintsExcluded} />
                    <div className="py-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Policy OIDs</span>
                        <BadgeList items={p.policyOids} />
                    </div>
                    <DetailField label="Inhibit Any Policy" value={p.inhibitAnyPolicy ? 'Yes' : 'No'} />
                    <DetailField label="EKU Extension Critical" value={p.extendedKeyUsageCritical ? 'Yes' : 'No'} />
                    <DetailField label="Policy Qualifiers (JSON)" value={typeof p.policyQualifiersJson === 'string' ? p.policyQualifiersJson : (p.policyQualifiersJson ? JSON.stringify(p.policyQualifiersJson) : undefined)} mono />
                    <div className="py-1">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Cert Profiles</span>
                        {allowedCpIds === null
                            ? <span className="text-xs text-gray-600 ml-2">Loading...</span>
                            : resolvedCpNames.length > 0
                                ? <div className="flex flex-wrap gap-1 mt-1">
                                    {resolvedCpNames.map((name, i) => (
                                        <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">{name}</span>
                                    ))}
                                </div>
                                : <span className="text-xs text-gray-600 ml-2">None</span>
                        }
                    </div>
                    <div className="mt-3 flex gap-2">
                        <button onClick={onStartEdit}
                            className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                            Edit
                        </button>
                        <button onClick={onDelete}
                            className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors">
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ─── SSH Extensions constants ─── */
const SSH_EXTENSION_OPTIONS = [
    'permit-pty', 'permit-port-forwarding', 'permit-agent-forwarding',
    'permit-X11-forwarding', 'permit-user-rc',
    'no-pty', 'no-port-forwarding', 'no-agent-forwarding',
    'no-X11-forwarding', 'no-user-rc',
];

/* ─── SSH Signing Profiles Tab ─── */
const SshSigningProfilesTab: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [caKeys, setCaKeys] = useState<any[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '', description: '', sshCaKeyId: '',
        maxValidityHours: '720', allowUserCerts: true, allowHostCerts: false,
        forceCommand: '', sourceAddressRestrictions: '',
        defaultExtensions: [] as string[],
    });
    const [form, setForm] = useState({
        name: '', description: '', sshCaKeyId: '',
        maxValidityHours: '720', allowUserCerts: true, allowHostCerts: false,
        forceCommand: '', sourceAddressRestrictions: '',
        defaultExtensions: ['permit-pty'] as string[],
    });

    const resetForm = () => setForm({
        name: '', description: '', sshCaKeyId: '',
        maxValidityHours: '720', allowUserCerts: true, allowHostCerts: false,
        forceCommand: '', sourceAddressRestrictions: '',
        defaultExtensions: ['permit-pty'],
    });

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/ssh/profiles/signing')
            .then((data) => setProfiles(Array.isArray(data) ? data : []))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        apiGet<any>('/api/v1/admin/ssh/ca-keys')
            .then((data) => setCaKeys(Array.isArray(data) ? data : []))
            .catch(() => {});
    }, []);

    const handleCreate = async () => {
        setCreating(true);
        try {
            await apiPost('/api/v1/admin/ssh/profiles/signing', {
                name: form.name,
                description: form.description || undefined,
                sshCaKeyId: form.sshCaKeyId,
                maxValidityHours: parseInt(form.maxValidityHours) || 720,
                allowUserCerts: form.allowUserCerts,
                allowHostCerts: form.allowHostCerts,
                forceCommand: form.forceCommand || undefined,
                sourceAddressRestrictions: JSON.stringify(form.sourceAddressRestrictions ? form.sourceAddressRestrictions.split(',').map(s => s.trim()).filter(Boolean) : []),
                defaultExtensions: JSON.stringify(form.defaultExtensions),
            });
            setShowCreate(false);
            resetForm();
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create SSH signing profile');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (profile: any) => {
        if (!window.confirm(`Delete SSH signing profile "${profile.name}"?`)) return;
        try {
            await apiDelete(`/api/v1/admin/ssh/profiles/signing/${profile.id}`);
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to delete');
        }
    };

    /** Populate edit form from an existing SSH signing profile */
    const startSshSigningEdit = (p: any) => {
        setEditForm({
            name: p.name || '',
            description: p.description || '',
            sshCaKeyId: p.sshCaKeyId || '',
            maxValidityHours: String(p.maxValidityHours ?? 720),
            allowUserCerts: !!p.allowUserCerts,
            allowHostCerts: !!p.allowHostCerts,
            forceCommand: p.forceCommand || '',
            sourceAddressRestrictions: parseJsonArray(p.sourceAddressRestrictions).join(', '),
            defaultExtensions: parseJsonArray(p.defaultExtensions),
        });
        setEditingId(p.id);
    };

    /** Save edited SSH signing profile via step-up MFA */
    const handleSaveSshSigningEdit = async (profileId: string) => {
        setSaving(true);
        try {
            await apiPutWithMfa(
                `/api/v1/admin/ssh/profiles/signing/${profileId}`,
                {
                    name: editForm.name,
                    description: editForm.description || undefined,
                    sshCaKeyId: editForm.sshCaKeyId,
                    maxValidityHours: parseInt(editForm.maxValidityHours) || 720,
                    allowUserCerts: editForm.allowUserCerts,
                    allowHostCerts: editForm.allowHostCerts,
                    forceCommand: editForm.forceCommand || undefined,
                    sourceAddressRestrictions: JSON.stringify(editForm.sourceAddressRestrictions ? editForm.sourceAddressRestrictions.split(',').map(s => s.trim()).filter(Boolean) : []),
                    defaultExtensions: JSON.stringify(editForm.defaultExtensions),
                },
                requireStepUp,
                'update-ssh-signing-profile',
                profileId,
            );
            setEditingId(null);
            load();
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to update SSH signing profile');
            }
        } finally {
            setSaving(false);
        }
    };

    const caKeyName = (id: string) => caKeys.find(k => k.id === id)?.name || id;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">SSH Signing Profiles</h3>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors">
                    {showCreate ? 'Cancel' : 'Create Profile'}
                </button>
            </div>

            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New SSH Signing Profile</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Name</label>
                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Default User Signing" />
                        </div>
                        <div>
                            <label className={labelClass}>Description</label>
                            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Optional" />
                        </div>
                        <div>
                            <label className={labelClass}>SSH CA Key</label>
                            <select value={form.sshCaKeyId} onChange={(e) => setForm({ ...form, sshCaKeyId: e.target.value })} className={inputClass}>
                                <option value="">-- Select CA Key --</option>
                                {caKeys.map(k => <option key={k.id} value={k.id}>{k.name} ({k.keyType})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Max Validity Hours</label>
                            <input type="text" inputMode="numeric" value={form.maxValidityHours} onChange={(e) => setForm({ ...form, maxValidityHours: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Force Command (optional)</label>
                            <input type="text" value={form.forceCommand} onChange={(e) => setForm({ ...form, forceCommand: e.target.value })} className={inputClass} placeholder="e.g. /usr/bin/rsync" />
                        </div>
                        <div>
                            <label className={labelClass}>Source Address Restrictions (comma-separated)</label>
                            <input type="text" value={form.sourceAddressRestrictions} onChange={(e) => setForm({ ...form, sourceAddressRestrictions: e.target.value })} className={inputClass} placeholder="e.g. 10.0.0.0/8, 192.168.1.0/24" />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.allowUserCerts} onChange={(e) => setForm({ ...form, allowUserCerts: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Allow User Certs
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.allowHostCerts} onChange={(e) => setForm({ ...form, allowHostCerts: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Allow Host Certs
                        </label>
                    </div>
                    <div>
                        <label className={labelClass}>Default Extensions</label>
                        <MultiToggle options={SSH_EXTENSION_OPTIONS} selected={form.defaultExtensions}
                            onChange={(next) => setForm({ ...form, defaultExtensions: next })} />
                    </div>
                    <button onClick={handleCreate} disabled={creating || !form.name || !form.sshCaKeyId}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && profiles.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No SSH signing profiles found</div>
                )}
                {!loading && !error && profiles.map((p) => {
                    const key = p.id;
                    const expanded = expandedKey === key;
                    return (
                        <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                            <button onClick={() => setExpandedKey(expanded ? null : key)}
                                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors">
                                <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                <span className="text-sm text-gray-900 dark:text-white font-medium">{p.name}</span>
                                {p.allowUserCerts && <StatusBadge status="active" label="User" />}
                                {p.allowHostCerts && <StatusBadge status="pending" label="Host" />}
                                <span className="text-xs text-gray-600">{caKeyName(p.sshCaKeyId)}</span>
                                <span className="ml-auto text-xs text-gray-600">{p.maxValidityHours}h max</span>
                            </button>
                            {expanded && editingId === key && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Edit SSH Signing Profile</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelClass}>Name</label>
                                            <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Description</label>
                                            <input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>SSH CA Key</label>
                                            <select value={editForm.sshCaKeyId} onChange={(e) => setEditForm({ ...editForm, sshCaKeyId: e.target.value })} className={inputClass}>
                                                <option value="">-- Select CA Key --</option>
                                                {caKeys.map(k => <option key={k.id} value={k.id}>{k.name} ({k.keyType})</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClass}>Max Validity Hours</label>
                                            <input type="text" inputMode="numeric" value={editForm.maxValidityHours} onChange={(e) => setEditForm({ ...editForm, maxValidityHours: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Force Command (optional)</label>
                                            <input type="text" value={editForm.forceCommand} onChange={(e) => setEditForm({ ...editForm, forceCommand: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Source Address Restrictions (comma-separated)</label>
                                            <input type="text" value={editForm.sourceAddressRestrictions} onChange={(e) => setEditForm({ ...editForm, sourceAddressRestrictions: e.target.value })} className={inputClass} />
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                            <input type="checkbox" checked={editForm.allowUserCerts} onChange={(e) => setEditForm({ ...editForm, allowUserCerts: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                            Allow User Certs
                                        </label>
                                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                            <input type="checkbox" checked={editForm.allowHostCerts} onChange={(e) => setEditForm({ ...editForm, allowHostCerts: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                            Allow Host Certs
                                        </label>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Default Extensions</label>
                                        <MultiToggle options={SSH_EXTENSION_OPTIONS} selected={editForm.defaultExtensions}
                                            onChange={(next) => setEditForm({ ...editForm, defaultExtensions: next })} />
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={() => handleSaveSshSigningEdit(key)} disabled={saving || !editForm.name || !editForm.sshCaKeyId}
                                            className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                        <button onClick={() => setEditingId(null)}
                                            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            {expanded && editingId !== key && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-1">
                                    <DetailField label="ID" value={p.id} mono />
                                    <DetailField label="Name" value={p.name} />
                                    <DetailField label="Description" value={p.description} />
                                    <DetailField label="SSH CA Key" value={caKeyName(p.sshCaKeyId)} />
                                    <DetailField label="Max Validity Hours" value={String(p.maxValidityHours)} />
                                    <DetailField label="Allow User Certs" value={p.allowUserCerts ? 'Yes' : 'No'} />
                                    <DetailField label="Allow Host Certs" value={p.allowHostCerts ? 'Yes' : 'No'} />
                                    <DetailField label="Force Command" value={p.forceCommand || 'None'} />
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Source Address Restrictions</span>
                                        <BadgeList items={p.sourceAddressRestrictions} />
                                    </div>
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Default Extensions</span>
                                        <BadgeList items={p.defaultExtensions} />
                                    </div>
                                    {p.createdAt && <DetailField label="Created" value={new Date(p.createdAt).toLocaleString()} />}
                                    <div className="mt-3 flex gap-2">
                                        <button onClick={() => startSshSigningEdit(p)}
                                            className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                            Edit
                                        </button>
                                        <button onClick={() => handleDelete(p)}
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
        </div>
    );
};

/* ─── SSH Cert Profiles Tab ─── */
const SshCertProfilesTab: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '', description: '',
        allowedPrincipalPatterns: '',
        maxPrincipals: '10',
        allowedExtensions: [] as string[],
        requiredExtensions: [] as string[],
        maxValidityHours: '720',
    });
    const [form, setForm] = useState({
        name: '', description: '',
        allowedPrincipalPatterns: '',
        maxPrincipals: '10',
        allowedExtensions: ['permit-pty', 'permit-port-forwarding', 'permit-agent-forwarding', 'permit-X11-forwarding', 'permit-user-rc'] as string[],
        requiredExtensions: [] as string[],
        maxValidityHours: '720',
    });

    const resetForm = () => setForm({
        name: '', description: '',
        allowedPrincipalPatterns: '', maxPrincipals: '10',
        allowedExtensions: ['permit-pty', 'permit-port-forwarding', 'permit-agent-forwarding', 'permit-X11-forwarding', 'permit-user-rc'],
        requiredExtensions: [], maxValidityHours: '720',
    });

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/ssh/profiles/cert')
            .then((data) => setProfiles(Array.isArray(data) ? data : []))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const handleCreate = async () => {
        setCreating(true);
        try {
            const patterns = form.allowedPrincipalPatterns.trim()
                ? form.allowedPrincipalPatterns.split('\n').map(s => s.trim()).filter(Boolean)
                : [];
            await apiPost('/api/v1/admin/ssh/profiles/cert', {
                name: form.name,
                description: form.description || undefined,
                allowedPrincipalPatterns: JSON.stringify(patterns),
                maxPrincipals: parseInt(form.maxPrincipals) || 10,
                allowedExtensions: JSON.stringify(form.allowedExtensions),
                requiredExtensions: JSON.stringify(form.requiredExtensions),
                maxValidityHours: parseInt(form.maxValidityHours) || 720,
            });
            setShowCreate(false);
            resetForm();
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create SSH cert profile');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (profile: any) => {
        if (!window.confirm(`Delete SSH cert profile "${profile.name}"?`)) return;
        try {
            await apiDelete(`/api/v1/admin/ssh/profiles/cert/${profile.id}`);
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to delete');
        }
    };

    /** Populate edit form from an existing SSH cert profile */
    const startSshCertEdit = (p: any) => {
        setEditForm({
            name: p.name || '',
            description: p.description || '',
            allowedPrincipalPatterns: parseJsonArray(p.allowedPrincipalPatterns).join('\n'),
            maxPrincipals: String(p.maxPrincipals ?? 10),
            allowedExtensions: parseJsonArray(p.allowedExtensions),
            requiredExtensions: parseJsonArray(p.requiredExtensions),
            maxValidityHours: String(p.maxValidityHours ?? 720),
        });
        setEditingId(p.id);
    };

    /** Save edited SSH cert profile via step-up MFA */
    const handleSaveSshCertEdit = async (profileId: string) => {
        setSaving(true);
        try {
            const patterns = editForm.allowedPrincipalPatterns.trim()
                ? editForm.allowedPrincipalPatterns.split('\n').map(s => s.trim()).filter(Boolean)
                : [];
            await apiPutWithMfa(
                `/api/v1/admin/ssh/profiles/cert/${profileId}`,
                {
                    name: editForm.name,
                    description: editForm.description || undefined,
                    allowedPrincipalPatterns: JSON.stringify(patterns),
                    maxPrincipals: parseInt(editForm.maxPrincipals) || 10,
                    allowedExtensions: JSON.stringify(editForm.allowedExtensions),
                    requiredExtensions: JSON.stringify(editForm.requiredExtensions),
                    maxValidityHours: parseInt(editForm.maxValidityHours) || 720,
                },
                requireStepUp,
                'update-ssh-cert-profile',
                profileId,
            );
            setEditingId(null);
            load();
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to update SSH cert profile');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">SSH Cert Profiles</h3>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors">
                    {showCreate ? 'Cancel' : 'Create Profile'}
                </button>
            </div>

            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New SSH Cert Profile</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Name</label>
                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Standard User Cert" />
                        </div>
                        <div>
                            <label className={labelClass}>Description</label>
                            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Optional" />
                        </div>
                        <div>
                            <label className={labelClass}>Max Principals</label>
                            <input type="text" inputMode="numeric" value={form.maxPrincipals} onChange={(e) => setForm({ ...form, maxPrincipals: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Max Validity Hours</label>
                            <input type="text" inputMode="numeric" value={form.maxValidityHours} onChange={(e) => setForm({ ...form, maxValidityHours: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Allowed Principal Patterns (one regex per line)</label>
                        <textarea rows={3} value={form.allowedPrincipalPatterns}
                            onChange={(e) => setForm({ ...form, allowedPrincipalPatterns: e.target.value })}
                            className={inputClass} placeholder={"^[a-z_][a-z0-9_-]*$\n^admin$"} />
                    </div>
                    <div>
                        <label className={labelClass}>Allowed Extensions</label>
                        <MultiToggle options={SSH_EXTENSION_OPTIONS} selected={form.allowedExtensions}
                            onChange={(next) => setForm({ ...form, allowedExtensions: next })} />
                    </div>
                    <div>
                        <label className={labelClass}>Required Extensions</label>
                        <MultiToggle options={SSH_EXTENSION_OPTIONS} selected={form.requiredExtensions}
                            onChange={(next) => setForm({ ...form, requiredExtensions: next })} />
                    </div>
                    <button onClick={handleCreate} disabled={creating || !form.name}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && profiles.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No SSH cert profiles found</div>
                )}
                {!loading && !error && profiles.map((p) => {
                    const key = p.id;
                    const expanded = expandedKey === key;
                    return (
                        <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                            <button onClick={() => setExpandedKey(expanded ? null : key)}
                                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors">
                                <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                <span className="text-sm text-gray-900 dark:text-white font-medium">{p.name}</span>
                                <span className="text-xs text-gray-600">Max {p.maxPrincipals} principals</span>
                                <span className="ml-auto text-xs text-gray-600">{p.maxValidityHours}h max</span>
                            </button>
                            {expanded && editingId === key && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Edit SSH Cert Profile</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelClass}>Name</label>
                                            <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Description</label>
                                            <input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Max Principals</label>
                                            <input type="text" inputMode="numeric" value={editForm.maxPrincipals} onChange={(e) => setEditForm({ ...editForm, maxPrincipals: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Max Validity Hours</label>
                                            <input type="text" inputMode="numeric" value={editForm.maxValidityHours} onChange={(e) => setEditForm({ ...editForm, maxValidityHours: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Allowed Principal Patterns (one regex per line)</label>
                                        <textarea rows={3} value={editForm.allowedPrincipalPatterns}
                                            onChange={(e) => setEditForm({ ...editForm, allowedPrincipalPatterns: e.target.value })}
                                            className={inputClass} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Allowed Extensions</label>
                                        <MultiToggle options={SSH_EXTENSION_OPTIONS} selected={editForm.allowedExtensions}
                                            onChange={(next) => setEditForm({ ...editForm, allowedExtensions: next })} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Required Extensions</label>
                                        <MultiToggle options={SSH_EXTENSION_OPTIONS} selected={editForm.requiredExtensions}
                                            onChange={(next) => setEditForm({ ...editForm, requiredExtensions: next })} />
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={() => handleSaveSshCertEdit(key)} disabled={saving || !editForm.name}
                                            className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                        <button onClick={() => setEditingId(null)}
                                            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            {expanded && editingId !== key && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-1">
                                    <DetailField label="ID" value={p.id} mono />
                                    <DetailField label="Name" value={p.name} />
                                    <DetailField label="Description" value={p.description} />
                                    <DetailField label="Max Principals" value={String(p.maxPrincipals)} />
                                    <DetailField label="Max Validity Hours" value={String(p.maxValidityHours)} />
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Principal Patterns</span>
                                        <BadgeList items={p.allowedPrincipalPatterns} />
                                    </div>
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Extensions</span>
                                        <BadgeList items={p.allowedExtensions} />
                                    </div>
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Required Extensions</span>
                                        <BadgeList items={p.requiredExtensions} />
                                    </div>
                                    {p.createdAt && <DetailField label="Created" value={new Date(p.createdAt).toLocaleString()} />}
                                    <div className="mt-3 flex gap-2">
                                        <button onClick={() => startSshCertEdit(p)}
                                            className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                            Edit
                                        </button>
                                        <button onClick={() => handleDelete(p)}
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
        </div>
    );
};

/* ─── SSH Request Profiles Tab ─── */
const SshRequestProfilesTab: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [profiles, setProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [signingProfiles, setSigningProfiles] = useState<any[]>([]);
    const [certProfiles, setCertProfiles] = useState<any[]>([]);
    const [authorities, setAuthorities] = useState<any[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '', description: '',
        allowedSshSigningProfileIds: [] as string[],
        allowedSshCertProfileIds: [] as string[],
        requireApproval: false,
        maxValidityHours: '720',
        certificateAuthorityId: '',
    });
    const [form, setForm] = useState({
        name: '', description: '',
        allowedSshSigningProfileIds: [] as string[],
        allowedSshCertProfileIds: [] as string[],
        requireApproval: false,
        maxValidityHours: '720',
        certificateAuthorityId: '',
    });

    const resetForm = () => setForm({
        name: '', description: '',
        allowedSshSigningProfileIds: [], allowedSshCertProfileIds: [],
        requireApproval: false, maxValidityHours: '720', certificateAuthorityId: '',
    });

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/ssh/profiles/request')
            .then((data) => setProfiles(Array.isArray(data) ? data : []))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        apiGet<any>('/api/v1/admin/ssh/profiles/signing')
            .then((data) => setSigningProfiles(Array.isArray(data) ? data : []))
            .catch(() => {});
        apiGet<any>('/api/v1/admin/ssh/profiles/cert')
            .then((data) => setCertProfiles(Array.isArray(data) ? data : []))
            .catch(() => {});
        apiGet<any>('/api/v1/admin/authorities')
            .then((data) => setAuthorities(Array.isArray(data) ? data : (data.items || data.authorities || [])))
            .catch(() => {});
    }, []);

    const handleCreate = async () => {
        setCreating(true);
        try {
            await apiPost('/api/v1/admin/ssh/profiles/request', {
                name: form.name,
                description: form.description || undefined,
                allowedSshSigningProfileIds: JSON.stringify(form.allowedSshSigningProfileIds),
                allowedSshCertProfileIds: JSON.stringify(form.allowedSshCertProfileIds),
                requireApproval: form.requireApproval,
                maxValidityHours: parseInt(form.maxValidityHours) || 720,
                certificateAuthorityId: form.certificateAuthorityId || undefined,
            });
            setShowCreate(false);
            resetForm();
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create SSH request profile');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (profile: any) => {
        if (!window.confirm(`Delete SSH request profile "${profile.name}"?`)) return;
        try {
            await apiDelete(`/api/v1/admin/ssh/profiles/request/${profile.id}`);
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to delete');
        }
    };

    /** Populate edit form from an existing SSH request profile */
    const startSshRequestEdit = (p: any) => {
        setEditForm({
            name: p.name || '',
            description: p.description || '',
            allowedSshSigningProfileIds: parseJsonArray(p.allowedSshSigningProfileIds),
            allowedSshCertProfileIds: parseJsonArray(p.allowedSshCertProfileIds),
            requireApproval: !!p.requireApproval,
            maxValidityHours: String(p.maxValidityHours ?? 720),
            certificateAuthorityId: p.certificateAuthorityId || '',
        });
        setEditingId(p.id);
    };

    /** Save edited SSH request profile via step-up MFA */
    const handleSaveSshRequestEdit = async (profileId: string) => {
        setSaving(true);
        try {
            await apiPutWithMfa(
                `/api/v1/admin/ssh/profiles/request/${profileId}`,
                {
                    name: editForm.name,
                    description: editForm.description || undefined,
                    allowedSshSigningProfileIds: JSON.stringify(editForm.allowedSshSigningProfileIds),
                    allowedSshCertProfileIds: JSON.stringify(editForm.allowedSshCertProfileIds),
                    requireApproval: editForm.requireApproval,
                    maxValidityHours: parseInt(editForm.maxValidityHours) || 720,
                    certificateAuthorityId: editForm.certificateAuthorityId || undefined,
                },
                requireStepUp,
                'update-ssh-request-profile',
                profileId,
            );
            setEditingId(null);
            load();
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to update SSH request profile');
            }
        } finally {
            setSaving(false);
        }
    };

    const resolveNames = (idsJson: any, items: any[]) => {
        const ids = parseJsonArray(idsJson);
        return ids.map(id => items.find(i => i.id === id)?.name || id);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">SSH Request Profiles</h3>
                <button onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors">
                    {showCreate ? 'Cancel' : 'Create Profile'}
                </button>
            </div>

            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New SSH Request Profile</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Name</label>
                            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="e.g. Developer Access" />
                        </div>
                        <div>
                            <label className={labelClass}>Description</label>
                            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="Optional" />
                        </div>
                        <div>
                            <label className={labelClass}>Max Validity Hours</label>
                            <input type="text" inputMode="numeric" value={form.maxValidityHours} onChange={(e) => setForm({ ...form, maxValidityHours: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>CA Scope</label>
                            <select value={form.certificateAuthorityId} onChange={(e) => setForm({ ...form, certificateAuthorityId: e.target.value })} className={inputClass}>
                                <option value="">-- Any CA --</option>
                                {authorities.map((a) => (
                                    <option key={a.certificateId || a.id} value={a.certificateId || a.id}>
                                        {a.name || a.commonName || a.label || a.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.requireApproval} onChange={(e) => setForm({ ...form, requireApproval: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Require Approval
                        </label>
                    </div>
                    <div>
                        <label className={labelClass}>Allowed SSH Signing Profiles</label>
                        <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-2 space-y-1">
                            {signingProfiles.length === 0 && <span className="text-xs text-gray-600">No signing profiles available</span>}
                            {signingProfiles.map(sp => (
                                <label key={sp.id} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                    <input type="checkbox"
                                        checked={form.allowedSshSigningProfileIds.includes(sp.id)}
                                        onChange={(e) => setForm({
                                            ...form,
                                            allowedSshSigningProfileIds: e.target.checked
                                                ? [...form.allowedSshSigningProfileIds, sp.id]
                                                : form.allowedSshSigningProfileIds.filter(id => id !== sp.id)
                                        })}
                                        className="accent-blue-500" />
                                    <span>{sp.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Allowed SSH Cert Profiles</label>
                        <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-2 space-y-1">
                            {certProfiles.length === 0 && <span className="text-xs text-gray-600">No cert profiles available</span>}
                            {certProfiles.map(cp => (
                                <label key={cp.id} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                    <input type="checkbox"
                                        checked={form.allowedSshCertProfileIds.includes(cp.id)}
                                        onChange={(e) => setForm({
                                            ...form,
                                            allowedSshCertProfileIds: e.target.checked
                                                ? [...form.allowedSshCertProfileIds, cp.id]
                                                : form.allowedSshCertProfileIds.filter(id => id !== cp.id)
                                        })}
                                        className="accent-blue-500" />
                                    <span>{cp.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <button onClick={handleCreate} disabled={creating || !form.name}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && profiles.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No SSH request profiles found</div>
                )}
                {!loading && !error && profiles.map((p) => {
                    const key = p.id;
                    const expanded = expandedKey === key;
                    return (
                        <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                            <button onClick={() => setExpandedKey(expanded ? null : key)}
                                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors">
                                <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                <span className="text-sm text-gray-900 dark:text-white font-medium">{p.name}</span>
                                {p.requireApproval && <StatusBadge status="pending" label="Approval" />}
                                <span className="ml-auto text-xs text-gray-600">{p.maxValidityHours}h max</span>
                            </button>
                            {expanded && editingId === key && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-3">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Edit SSH Request Profile</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelClass}>Name</label>
                                            <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Description</label>
                                            <input type="text" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Max Validity Hours</label>
                                            <input type="text" inputMode="numeric" value={editForm.maxValidityHours} onChange={(e) => setEditForm({ ...editForm, maxValidityHours: e.target.value.replace(/\D/g, '') })} className={inputClass} />
                                        </div>
                                        <div>
                                            <label className={labelClass}>CA Scope</label>
                                            <select value={editForm.certificateAuthorityId} onChange={(e) => setEditForm({ ...editForm, certificateAuthorityId: e.target.value })} className={inputClass}>
                                                <option value="">-- Any CA --</option>
                                                {authorities.map((a) => (
                                                    <option key={a.certificateId || a.id} value={a.certificateId || a.id}>
                                                        {a.name || a.commonName || a.label || a.id}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-4">
                                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                            <input type="checkbox" checked={editForm.requireApproval} onChange={(e) => setEditForm({ ...editForm, requireApproval: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                            Require Approval
                                        </label>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Allowed SSH Signing Profiles</label>
                                        <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-2 space-y-1">
                                            {signingProfiles.length === 0 && <span className="text-xs text-gray-600">No signing profiles available</span>}
                                            {signingProfiles.map(sp => (
                                                <label key={sp.id} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                                    <input type="checkbox"
                                                        checked={editForm.allowedSshSigningProfileIds.includes(sp.id)}
                                                        onChange={(e) => setEditForm({
                                                            ...editForm,
                                                            allowedSshSigningProfileIds: e.target.checked
                                                                ? [...editForm.allowedSshSigningProfileIds, sp.id]
                                                                : editForm.allowedSshSigningProfileIds.filter(id => id !== sp.id)
                                                        })}
                                                        className="accent-blue-500" />
                                                    <span>{sp.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Allowed SSH Cert Profiles</label>
                                        <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-2 space-y-1">
                                            {certProfiles.length === 0 && <span className="text-xs text-gray-600">No cert profiles available</span>}
                                            {certProfiles.map(cp => (
                                                <label key={cp.id} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                                    <input type="checkbox"
                                                        checked={editForm.allowedSshCertProfileIds.includes(cp.id)}
                                                        onChange={(e) => setEditForm({
                                                            ...editForm,
                                                            allowedSshCertProfileIds: e.target.checked
                                                                ? [...editForm.allowedSshCertProfileIds, cp.id]
                                                                : editForm.allowedSshCertProfileIds.filter(id => id !== cp.id)
                                                        })}
                                                        className="accent-blue-500" />
                                                    <span>{cp.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={() => handleSaveSshRequestEdit(key)} disabled={saving || !editForm.name}
                                            className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                        <button onClick={() => setEditingId(null)}
                                            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            {expanded && editingId !== key && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-1">
                                    <DetailField label="ID" value={p.id} mono />
                                    <DetailField label="Name" value={p.name} />
                                    <DetailField label="Description" value={p.description} />
                                    <DetailField label="CA Scope" value={p.certificateAuthorityId ? (authorities.find(a => (a.certificateId || a.id) === p.certificateAuthorityId)?.name || authorities.find(a => (a.certificateId || a.id) === p.certificateAuthorityId)?.commonName || p.certificateAuthorityId) : 'Any CA'} />
                                    <DetailField label="Require Approval" value={p.requireApproval ? 'Yes' : 'No'} />
                                    <DetailField label="Max Validity Hours" value={String(p.maxValidityHours)} />
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Signing Profiles</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {resolveNames(p.allowedSshSigningProfileIds, signingProfiles).map((name, i) => (
                                                <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">{name}</span>
                                            ))}
                                            {resolveNames(p.allowedSshSigningProfileIds, signingProfiles).length === 0 && (
                                                <span className="text-gray-600 text-xs">Any</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="py-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Cert Profiles</span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {resolveNames(p.allowedSshCertProfileIds, certProfiles).map((name, i) => (
                                                <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">{name}</span>
                                            ))}
                                            {resolveNames(p.allowedSshCertProfileIds, certProfiles).length === 0 && (
                                                <span className="text-gray-600 text-xs">Any</span>
                                            )}
                                        </div>
                                    </div>
                                    {p.createdAt && <DetailField label="Created" value={new Date(p.createdAt).toLocaleString()} />}
                                    <div className="mt-3 flex gap-2">
                                        <button onClick={() => startSshRequestEdit(p)}
                                            className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                            Edit
                                        </button>
                                        <button onClick={() => handleDelete(p)}
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
        </div>
    );
};

/* ─── Profile Management Page ─── */
const ProfileManagement: React.FC = () => {
    const [activeTab, setActiveTab] = useState<Tab>('Certificate Profiles');

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile Management</h1>

            <div className="flex gap-1 border-b border-gray-300 dark:border-gray-700 overflow-x-auto">
                {TABS.map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === tab
                            ? 'text-blue-800 dark:text-blue-400 border-blue-400'
                            : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-700 dark:text-gray-300'}`}>
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'Certificate Profiles' && <CertProfilesTab />}
            {activeTab === 'Signing Profiles' && <SigningProfilesTab />}
            {activeTab === 'Request Profiles' && <RequestProfilesTab />}
            {activeTab === 'SSH Signing' && <SshSigningProfilesTab />}
            {activeTab === 'SSH Cert' && <SshCertProfilesTab />}
            {activeTab === 'SSH Request' && <SshRequestProfilesTab />}
        </div>
    );
};

export default ProfileManagement;
