import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, apiPutWithMfa, apiDeleteWithMfa } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

const DN_FIELD_OPTIONS = ['CN', 'O', 'OU', 'L', 'ST', 'C', 'DC'];
const REQUIREMENT_OPTIONS = ['Required', 'Optional', 'Forbidden'];
const SAN_TYPE_OPTIONS = ['DNS', 'IP', 'Email', 'URI'];

const inputClass = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500';
const labelClass = 'block text-xs text-gray-600 dark:text-gray-400 mb-1';

interface SubjectDnFieldRule {
    field: string;
    requirement: string;
    fixedValue?: string;
    regex?: string;
    maxLength?: number | null;
    defaultValue?: string;
}

interface SanRulesModel {
    allowedTypes: string[];
    required: boolean;
    rules: Record<string, { regex?: string; maxCount: number }>;
}

interface RequestProfile {
    id: string;
    name: string;
    description?: string;
    subjectDnRules: SubjectDnFieldRule[];
    sanRules: SanRulesModel;
    allowedCertProfileIds: string[];
    defaultCertProfileId?: string;
    requireApproval: boolean;
    maxValidityPeriod?: string;
    createdAt: string;
    updatedAt: string;
    inheritsFromId?: string;
    inheritanceEnabled?: boolean;
    certificateAuthorityId?: string;
}

const emptyDnRule = (): SubjectDnFieldRule => ({
    field: 'CN', requirement: 'Required', fixedValue: '', regex: '', maxLength: null, defaultValue: '',
});

const emptySanRules = (): SanRulesModel => ({
    allowedTypes: ['DNS', 'IP'], required: false, rules: {},
});

/** Field source indicator for resolved profile views */
const ReqFieldSourceBadge: React.FC<{ source?: string }> = ({ source }) => {
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
const ReqSourceBorderedField: React.FC<{ source?: string; label: string; value?: string | null }> = ({ source, label, value }) => {
    const borderColor = source === 'overridden' ? 'border-l-green-500' : source === 'inherited' ? 'border-l-gray-500' : '';
    return (
        <div className={`pl-3 border-l-2 ${borderColor}`}>
            <div className="flex items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                <ReqFieldSourceBadge source={source} />
            </div>
            <span className="text-sm text-gray-900 dark:text-white">{value || '-'}</span>
        </div>
    );
};

const RequestProfiles: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [profiles, setProfiles] = useState<RequestProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedProfile, setSelectedProfile] = useState<RequestProfile | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [certProfiles, setCertProfiles] = useState<any[]>([]);
    const [authorities, setAuthorities] = useState<any[]>([]);
    const [resolvedProfile, setResolvedProfile] = useState<any | null>(null);
    const [resolvedLoading, setResolvedLoading] = useState(false);
    const [validationResult, setValidationResult] = useState<{ isValid: boolean; errors: string[] } | null>(null);
    const [validationLoading, setValidationLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '', description: '',
        requireApproval: false,
        requiredApprovalCount: '',
        maxValidityPeriod: '',
        defaultCertProfileId: '',
        subjectDnRulesJson: '',
        sanRulesJson: '',
        allowedCertProfileIds: [] as string[],
        inheritsFromId: '',
        inheritanceEnabled: false,
        certificateAuthorityId: '',
    });

    // Create form state
    const [form, setForm] = useState({
        name: '',
        description: '',
        requireApproval: false,
        maxValidityPeriod: '',
        defaultCertProfileId: '',
        subjectDnRules: [emptyDnRule()] as SubjectDnFieldRule[],
        sanRules: emptySanRules(),
        inheritsFromId: '',
        inheritanceEnabled: false,
        certificateAuthorityId: '',
    });

    const resetForm = () => setForm({
        name: '', description: '', requireApproval: false, maxValidityPeriod: '',
        defaultCertProfileId: '',
        subjectDnRules: [emptyDnRule()],
        sanRules: emptySanRules(),
        inheritsFromId: '', inheritanceEnabled: false, certificateAuthorityId: '',
    });

    const load = () => {
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/request-profiles')
            .then((data) => setProfiles(Array.isArray(data) ? data : (data.items || data.profiles || [])))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        apiGet<any>('/api/v1/admin/cert-profiles')
            .then((data) => setCertProfiles(Array.isArray(data) ? data : (data.items || data.profiles || [])))
            .catch(() => {});
        apiGet<any>('/api/v1/admin/authorities')
            .then((data) => setAuthorities(Array.isArray(data) ? data : (data.items || data.authorities || [])))
            .catch(() => {});
    }, []);

    /** Resolve parent profile name from ID */
    const resolveParentName = (id: string | undefined | null) => {
        if (!id) return undefined;
        const p = profiles.find((pr) => pr.id === id);
        return p ? p.name : id;
    };

    /** Fetch the resolved (merged) profile */
    const fetchResolvedProfile = async (profileId: string) => {
        setResolvedLoading(true);
        setResolvedProfile(null);
        try {
            const data = await apiGet<any>(`/api/v1/admin/request-profiles/${profileId}/resolved`);
            setResolvedProfile(data);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to fetch resolved profile');
        } finally {
            setResolvedLoading(false);
        }
    };

    /** Validate inheritance constraints */
    const fetchValidation = async (profileId: string) => {
        setValidationLoading(true);
        setValidationResult(null);
        try {
            const data = await apiPost<any>(`/api/v1/admin/request-profiles/${profileId}/validate-inheritance`, {});
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
                name: form.name,
                description: form.description || undefined,
                requireApproval: form.requireApproval,
                maxValidityPeriod: form.maxValidityPeriod || undefined,
                defaultCertProfileId: form.defaultCertProfileId || undefined,
                subjectDnRules: form.subjectDnRules.map((r) => ({
                    field: r.field,
                    requirement: r.requirement,
                    fixedValue: r.fixedValue || undefined,
                    regex: r.regex || undefined,
                    maxLength: r.maxLength || undefined,
                    defaultValue: r.defaultValue || undefined,
                })),
                sanRules: {
                    allowedTypes: form.sanRules.allowedTypes,
                    required: form.sanRules.required,
                    rules: {},
                },
                inheritsFromId: form.inheritsFromId || undefined,
                inheritanceEnabled: form.inheritanceEnabled,
                certificateAuthorityId: form.certificateAuthorityId || undefined,
            };
            await apiPost('/api/v1/admin/request-profiles', body);
            setShowCreate(false);
            resetForm();
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create request profile');
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (profile: RequestProfile) => {
        if (!window.confirm(`Delete request profile "${profile.name}"?`)) return;
        try {
            await apiDeleteWithMfa(`/api/v1/admin/request-profiles/${profile.id}`, requireStepUp, 'delete-request-profile', profile.id);
            if (selectedProfile?.id === profile.id) setSelectedProfile(null);
            load();
        } catch (err: any) {
            showToast('error', err.message || 'Failed to delete request profile');
        }
    };

    // --- Subject DN Rules builder helpers ---
    const updateDnRule = (index: number, updates: Partial<SubjectDnFieldRule>) => {
        const rules = [...form.subjectDnRules];
        rules[index] = { ...rules[index], ...updates };
        setForm({ ...form, subjectDnRules: rules });
    };

    const addDnRule = () => {
        setForm({ ...form, subjectDnRules: [...form.subjectDnRules, emptyDnRule()] });
    };

    const removeDnRule = (index: number) => {
        const rules = form.subjectDnRules.filter((_, i) => i !== index);
        setForm({ ...form, subjectDnRules: rules.length > 0 ? rules : [emptyDnRule()] });
    };

    // --- SAN type toggles ---
    const toggleSanType = (type: string) => {
        const current = form.sanRules.allowedTypes;
        const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
        setForm({ ...form, sanRules: { ...form.sanRules, allowedTypes: next } });
    };

    const resolveProfileName = (id: string) => {
        const cp = certProfiles.find((c) => (c.id || c.certProfileId) === id);
        return cp ? cp.name : id;
    };

    /** Populate edit form from an existing request profile */
    const startRequestEdit = (p: RequestProfile) => {
        setEditForm({
            name: p.name || '',
            description: p.description || '',
            requireApproval: !!p.requireApproval,
            requiredApprovalCount: '',
            maxValidityPeriod: p.maxValidityPeriod || '',
            defaultCertProfileId: p.defaultCertProfileId || '',
            subjectDnRulesJson: p.subjectDnRules ? JSON.stringify(p.subjectDnRules, null, 2) : '[]',
            sanRulesJson: p.sanRules ? JSON.stringify(p.sanRules, null, 2) : '{}',
            allowedCertProfileIds: Array.isArray(p.allowedCertProfileIds) ? p.allowedCertProfileIds : [],
            inheritsFromId: p.inheritsFromId || '',
            inheritanceEnabled: !!p.inheritanceEnabled,
            certificateAuthorityId: p.certificateAuthorityId || '',
        });
        setEditingId(p.id);
    };

    /** Save edited request profile via step-up MFA */
    const handleSaveRequestEdit = async (profileId: string) => {
        setSaving(true);
        try {
            let subjectDnRules;
            try { subjectDnRules = JSON.parse(editForm.subjectDnRulesJson); } catch { showToast('warning', 'Invalid JSON for Subject DN Rules'); setSaving(false); return; }
            let sanRules;
            try { sanRules = JSON.parse(editForm.sanRulesJson); } catch { showToast('warning', 'Invalid JSON for SAN Rules'); setSaving(false); return; }

            const body = {
                name: editForm.name,
                description: editForm.description || undefined,
                requireApproval: editForm.requireApproval,
                maxValidityPeriod: editForm.maxValidityPeriod || undefined,
                defaultCertProfileId: editForm.defaultCertProfileId || undefined,
                subjectDnRules,
                sanRules,
                allowedCertProfileIds: editForm.allowedCertProfileIds,
                inheritsFromId: editForm.inheritsFromId || undefined,
                inheritanceEnabled: editForm.inheritanceEnabled,
                certificateAuthorityId: editForm.certificateAuthorityId || undefined,
            };
            await apiPutWithMfa(
                `/api/v1/admin/request-profiles/${profileId}`,
                body,
                requireStepUp,
                'update-request-profile',
                profileId,
            );
            setEditingId(null);
            setSelectedProfile(null);
            load();
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to update request profile');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Request Profiles</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Manage enrollment request profiles that define subject DN rules, SAN constraints, and approval requirements.
            </p>

            {/* Create toggle */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">All Profiles</h3>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors"
                >
                    {showCreate ? 'Cancel' : 'Create Profile'}
                </button>
            </div>

            {/* Create Form */}
            {showCreate && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">New Request Profile</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Name</label>
                            <input type="text" value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className={inputClass} placeholder="e.g. Standard TLS Request" />
                        </div>
                        <div>
                            <label className={labelClass}>Description</label>
                            <input type="text" value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                className={inputClass} placeholder="Optional description" />
                        </div>
                        <div>
                            <label className={labelClass}>Max Validity Period (ISO 8601)</label>
                            <input type="text" value={form.maxValidityPeriod}
                                onChange={(e) => setForm({ ...form, maxValidityPeriod: e.target.value })}
                                className={inputClass} placeholder="e.g. P365D or P1Y" />
                        </div>
                        <div>
                            <label className={labelClass}>Default Certificate Profile</label>
                            <select value={form.defaultCertProfileId}
                                onChange={(e) => setForm({ ...form, defaultCertProfileId: e.target.value })}
                                className={inputClass}>
                                <option value="">-- None --</option>
                                {certProfiles.map((cp) => {
                                    const cpId = cp.id || cp.certProfileId;
                                    return (
                                        <option key={cpId} value={cpId}>{cp.name}</option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Inherits From</label>
                            <select value={form.inheritsFromId} onChange={(e) => setForm({ ...form, inheritsFromId: e.target.value })} className={inputClass}>
                                <option value="">-- None (standalone) --</option>
                                {profiles.map((pr) => (
                                    <option key={pr.id} value={pr.id}>{pr.name}</option>
                                ))}
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
                            <input type="checkbox" checked={form.requireApproval}
                                onChange={(e) => setForm({ ...form, requireApproval: e.target.checked })}
                                className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Require Approval
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={form.inheritanceEnabled}
                                onChange={(e) => setForm({ ...form, inheritanceEnabled: e.target.checked })}
                                className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                            Enable Inheritance
                        </label>
                    </div>

                    {/* Subject DN Rules builder */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className={labelClass}>Subject DN Rules</label>
                            <button type="button" onClick={addDnRule}
                                className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                + Add Rule
                            </button>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded overflow-x-auto">
                            <table className="w-full min-w-[600px] text-xs">
                                <thead>
                                    <tr className="border-b border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                                        <th className="px-2 py-2 text-left">Field</th>
                                        <th className="px-2 py-2 text-left">Requirement</th>
                                        <th className="px-2 py-2 text-left">Fixed Value</th>
                                        <th className="px-2 py-2 text-left">Regex</th>
                                        <th className="px-2 py-2 text-left">Max Length</th>
                                        <th className="px-2 py-2 text-left">Default</th>
                                        <th className="px-2 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.subjectDnRules.map((rule, idx) => (
                                        <tr key={idx} className="border-b border-gray-200 dark:border-gray-800">
                                            <td className="px-2 py-1">
                                                <select value={rule.field}
                                                    onChange={(e) => updateDnRule(idx, { field: e.target.value })}
                                                    className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-gray-900 dark:text-white text-xs w-16">
                                                    {DN_FIELD_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-2 py-1">
                                                <select value={rule.requirement}
                                                    onChange={(e) => updateDnRule(idx, { requirement: e.target.value })}
                                                    className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-gray-900 dark:text-white text-xs w-24">
                                                    {REQUIREMENT_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-2 py-1">
                                                <input type="text" value={rule.fixedValue || ''}
                                                    onChange={(e) => updateDnRule(idx, { fixedValue: e.target.value })}
                                                    className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-gray-900 dark:text-white text-xs w-24"
                                                    placeholder="Optional" />
                                            </td>
                                            <td className="px-2 py-1">
                                                <input type="text" value={rule.regex || ''}
                                                    onChange={(e) => updateDnRule(idx, { regex: e.target.value })}
                                                    className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-gray-900 dark:text-white text-xs w-24"
                                                    placeholder="e.g. ^[a-z]+$" />
                                            </td>
                                            <td className="px-2 py-1">
                                                <input type="text" inputMode="numeric" value={rule.maxLength ?? ''}
                                                    onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); updateDnRule(idx, { maxLength: v ? parseInt(v) : null }); }}
                                                    className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-gray-900 dark:text-white text-xs w-16"
                                                    placeholder="64" />
                                            </td>
                                            <td className="px-2 py-1">
                                                <input type="text" value={rule.defaultValue || ''}
                                                    onChange={(e) => updateDnRule(idx, { defaultValue: e.target.value })}
                                                    className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-gray-900 dark:text-white text-xs w-24"
                                                    placeholder="Optional" />
                                            </td>
                                            <td className="px-2 py-1">
                                                <button type="button" onClick={() => removeDnRule(idx)}
                                                    className="text-red-800 dark:text-red-400 hover:text-red-300 text-xs px-1">
                                                    X
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* SAN Rules */}
                    <div>
                        <label className={labelClass}>SAN Rules</label>
                        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-3 space-y-2">
                            <div>
                                <span className="text-xs text-gray-600 dark:text-gray-400 mr-2">Allowed Types:</span>
                                <div className="inline-flex flex-wrap gap-2 mt-1">
                                    {SAN_TYPE_OPTIONS.map((type) => {
                                        const active = form.sanRules.allowedTypes.includes(type);
                                        return (
                                            <button key={type} type="button" onClick={() => toggleSanType(type)}
                                                className={`px-2 py-1 text-xs rounded border transition-colors ${active
                                                    ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                                    : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-gray-500'}`}>
                                                {type}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                <input type="checkbox" checked={form.sanRules.required}
                                    onChange={(e) => setForm({ ...form, sanRules: { ...form.sanRules, required: e.target.checked } })}
                                    className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                SAN Required
                            </label>
                        </div>
                    </div>

                    <button onClick={handleCreate} disabled={creating || !form.name}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                        {creating ? 'Creating...' : 'Create'}
                    </button>
                </div>
            )}

            {/* Profile List Table */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-x-auto">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && profiles.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No request profiles found</div>
                )}
                {!loading && !error && profiles.length > 0 && (
                    <table className="w-full min-w-[600px] text-sm">
                        <thead>
                            <tr className="border-b border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs">
                                <th className="px-4 py-3 text-left">Name</th>
                                <th className="px-4 py-3 text-left">Approval</th>
                                <th className="px-4 py-3 text-left">DN Rules</th>
                                <th className="px-4 py-3 text-left">SAN</th>
                                <th className="px-4 py-3 text-left">Max Validity</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {profiles.map((p) => (
                                <tr key={p.id} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0 hover:bg-gray-200/30 dark:bg-gray-700/30 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => { setSelectedProfile(p); setResolvedProfile(null); setValidationResult(null); }}
                                                className="text-blue-800 dark:text-blue-400 hover:text-blue-300 font-medium text-left">
                                                {p.name}
                                            </button>
                                            {p.inheritanceEnabled && p.inheritsFromId && (
                                                <span className="px-2 py-0.5 text-[10px] rounded bg-purple-900/40 text-purple-300 border border-purple-700">
                                                    Inherits: {resolveParentName(p.inheritsFromId)}
                                                </span>
                                            )}
                                        </div>
                                        {p.description && (
                                            <div className="text-xs text-gray-600 mt-0.5">{p.description}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge
                                            status={p.requireApproval ? 'pending' : 'enabled'}
                                            label={p.requireApproval ? 'Required' : 'Auto'}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                                        <span className="text-xs">{p.subjectDnRules?.length || 0} rules</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge
                                            status={p.sanRules?.required ? 'active' : 'disabled'}
                                            label={p.sanRules?.required ? 'Required' : 'Optional'}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                                        {p.maxValidityPeriod || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => handleDelete(p)}
                                            className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Detail Modal */}
            {selectedProfile && (
                <div className="fixed inset-0 bg-black/25 dark:bg-black/60 flex items-center justify-center z-50 p-4"
                    onClick={() => { setSelectedProfile(null); setEditingId(null); }}>
                    <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-gray-300 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedProfile.name}</h3>
                            <button onClick={() => { setSelectedProfile(null); setEditingId(null); }}
                                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-900 dark:text-white text-xl px-2">
                                X
                            </button>
                        </div>

                        {/* Edit mode */}
                        {editingId === selectedProfile.id && (
                            <div className="p-4 space-y-3">
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Edit Request Profile</h4>
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
                                        <label className={labelClass}>Max Validity Period (ISO 8601)</label>
                                        <input type="text" value={editForm.maxValidityPeriod} onChange={(e) => setEditForm({ ...editForm, maxValidityPeriod: e.target.value })} className={inputClass} placeholder="e.g. P365D" />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Default Certificate Profile</label>
                                        <select value={editForm.defaultCertProfileId} onChange={(e) => setEditForm({ ...editForm, defaultCertProfileId: e.target.value })} className={inputClass}>
                                            <option value="">-- None --</option>
                                            {certProfiles.map((cp) => {
                                                const cpId = cp.id || cp.certProfileId;
                                                return <option key={cpId} value={cpId}>{cp.name}</option>;
                                            })}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Inherits From</label>
                                        <select value={editForm.inheritsFromId} onChange={(e) => setEditForm({ ...editForm, inheritsFromId: e.target.value })} className={inputClass}>
                                            <option value="">-- None (standalone) --</option>
                                            {profiles.filter(pr => pr.id !== selectedProfile.id).map((pr) => (
                                                <option key={pr.id} value={pr.id}>{pr.name}</option>
                                            ))}
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
                                        <input type="checkbox" checked={editForm.requireApproval} onChange={(e) => setEditForm({ ...editForm, requireApproval: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                        Require Approval
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                        <input type="checkbox" checked={editForm.inheritanceEnabled} onChange={(e) => setEditForm({ ...editForm, inheritanceEnabled: e.target.checked })} className="w-4 h-4 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 rounded" />
                                        Enable Inheritance
                                    </label>
                                </div>
                                <div>
                                    <label className={labelClass}>Subject DN Rules (JSON)</label>
                                    <textarea rows={6} value={editForm.subjectDnRulesJson}
                                        onChange={(e) => setEditForm({ ...editForm, subjectDnRulesJson: e.target.value })}
                                        className={inputClass + ' font-mono text-xs'} />
                                </div>
                                <div>
                                    <label className={labelClass}>SAN Rules (JSON)</label>
                                    <textarea rows={4} value={editForm.sanRulesJson}
                                        onChange={(e) => setEditForm({ ...editForm, sanRulesJson: e.target.value })}
                                        className={inputClass + ' font-mono text-xs'} />
                                </div>
                                <div>
                                    <label className={labelClass}>Allowed Cert Profiles</label>
                                    <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-2 space-y-1">
                                        {certProfiles.length === 0 && <span className="text-xs text-gray-600">No cert profiles available</span>}
                                        {certProfiles.map((cp) => {
                                            const cpId = cp.id || cp.certProfileId;
                                            return (
                                                <label key={cpId} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:bg-gray-800 px-1 rounded">
                                                    <input type="checkbox"
                                                        checked={editForm.allowedCertProfileIds.includes(cpId)}
                                                        onChange={(e) => {
                                                            const updated = e.target.checked
                                                                ? [...editForm.allowedCertProfileIds, cpId]
                                                                : editForm.allowedCertProfileIds.filter((id: string) => id !== cpId);
                                                            setEditForm({ ...editForm, allowedCertProfileIds: updated });
                                                        }}
                                                        className="accent-blue-500" />
                                                    <span>{cp.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => handleSaveRequestEdit(selectedProfile.id)} disabled={saving || !editForm.name}
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

                        {/* Read-only mode */}
                        {editingId !== selectedProfile.id && (
                        <div className="p-4 space-y-3">
                            <DetailField label="ID" value={selectedProfile.id} />
                            <DetailField label="Name" value={selectedProfile.name} />
                            <DetailField label="Description" value={selectedProfile.description} />
                            <DetailField label="Require Approval" value={selectedProfile.requireApproval ? 'Yes' : 'No'} />
                            <DetailField label="Max Validity Period" value={selectedProfile.maxValidityPeriod} />
                            <DetailField label="Default Cert Profile"
                                value={selectedProfile.defaultCertProfileId
                                    ? resolveProfileName(selectedProfile.defaultCertProfileId)
                                    : 'None'} />
                            <DetailField label="Created" value={selectedProfile.createdAt ? new Date(selectedProfile.createdAt).toLocaleString() : undefined} />
                            <DetailField label="Updated" value={selectedProfile.updatedAt ? new Date(selectedProfile.updatedAt).toLocaleString() : undefined} />

                            {/* Allowed Cert Profile IDs */}
                            {selectedProfile.allowedCertProfileIds && selectedProfile.allowedCertProfileIds.length > 0 && (
                                <div className="py-1">
                                    <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Cert Profiles</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {selectedProfile.allowedCertProfileIds.map((cpId, i) => (
                                            <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                                                {resolveProfileName(cpId)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Subject DN Rules table */}
                            <div className="py-2">
                                <span className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Subject DN Rules</span>
                                {selectedProfile.subjectDnRules && selectedProfile.subjectDnRules.length > 0 ? (
                                    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded overflow-x-auto">
                                        <table className="w-full min-w-[600px] text-xs">
                                            <thead>
                                                <tr className="border-b border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                                                    <th className="px-3 py-2 text-left">Field</th>
                                                    <th className="px-3 py-2 text-left">Requirement</th>
                                                    <th className="px-3 py-2 text-left">Fixed Value</th>
                                                    <th className="px-3 py-2 text-left">Regex</th>
                                                    <th className="px-3 py-2 text-left">Max Length</th>
                                                    <th className="px-3 py-2 text-left">Default</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedProfile.subjectDnRules.map((rule, idx) => (
                                                    <tr key={idx} className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
                                                        <td className="px-3 py-2 text-gray-900 dark:text-white font-medium">{rule.field}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-2 py-0.5 rounded text-xs border ${
                                                                rule.requirement === 'Required'
                                                                    ? 'bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700'
                                                                    : rule.requirement === 'Forbidden'
                                                                        ? 'bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700'
                                                                        : 'bg-gray-200/50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 border-gray-400 dark:border-gray-600'
                                                            }`}>
                                                                {rule.requirement}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{rule.fixedValue || '-'}</td>
                                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-mono">{rule.regex || '-'}</td>
                                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{rule.maxLength ?? '-'}</td>
                                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{rule.defaultValue || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-600">No DN rules defined</span>
                                )}
                            </div>

                            {/* SAN Rules */}
                            <div className="py-2">
                                <span className="text-xs text-gray-600 dark:text-gray-400 block mb-1">SAN Rules</span>
                                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-3 space-y-2">
                                    <div>
                                        <span className="text-xs text-gray-600 dark:text-gray-400 mr-2">Allowed Types:</span>
                                        <div className="inline-flex flex-wrap gap-1 mt-1">
                                            {(selectedProfile.sanRules?.allowedTypes || []).map((type, i) => (
                                                <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                                                    {type}
                                                </span>
                                            ))}
                                            {(!selectedProfile.sanRules?.allowedTypes || selectedProfile.sanRules.allowedTypes.length === 0) && (
                                                <span className="text-xs text-gray-600">None</span>
                                            )}
                                        </div>
                                    </div>
                                    <DetailField label="SAN Required" value={selectedProfile.sanRules?.required ? 'Yes' : 'No'} />
                                </div>
                            </div>

                            {/* Inheritance info */}
                            {selectedProfile.inheritanceEnabled && (
                                <DetailField label="Inherits From" value={resolveParentName(selectedProfile.inheritsFromId) || 'None'} />
                            )}
                            <DetailField label="CA Scope" value={selectedProfile.certificateAuthorityId ? String(selectedProfile.certificateAuthorityId) : 'System-wide'} />

                            {/* Inheritance actions */}
                            {selectedProfile.inheritanceEnabled && selectedProfile.inheritsFromId && (
                                <div className="mt-3 space-y-3">
                                    <div className="flex gap-2">
                                        <button onClick={() => fetchResolvedProfile(selectedProfile.id)}
                                            disabled={resolvedLoading}
                                            className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors disabled:opacity-50">
                                            {resolvedLoading ? 'Loading...' : 'Resolved Profile'}
                                        </button>
                                        <button onClick={() => fetchValidation(selectedProfile.id)}
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
                                            <ReqSourceBorderedField source={resolvedProfile.fieldSources?.Name} label="Name" value={resolvedProfile.name} />
                                            <ReqSourceBorderedField source={resolvedProfile.fieldSources?.Description} label="Description" value={resolvedProfile.description} />
                                            <ReqSourceBorderedField source={resolvedProfile.fieldSources?.RequireApproval} label="Require Approval" value={resolvedProfile.requireApproval ? 'Yes' : 'No'} />
                                            <ReqSourceBorderedField source={resolvedProfile.fieldSources?.MaxValidityPeriod} label="Max Validity Period" value={resolvedProfile.maxValidityPeriod} />
                                            <ReqSourceBorderedField source={resolvedProfile.fieldSources?.RequiredApprovalCount} label="Required Approval Count" value={String(resolvedProfile.requiredApprovalCount ?? '-')} />
                                            <ReqSourceBorderedField source={resolvedProfile.fieldSources?.DefaultCertProfileId} label="Default Cert Profile" value={resolvedProfile.defaultCertProfileId ? resolveProfileName(resolvedProfile.defaultCertProfileId) : 'None'} />
                                            <div className={`pl-3 border-l-2 ${resolvedProfile.fieldSources?.SubjectDnRules === 'overridden' ? 'border-l-green-500' : 'border-l-gray-500'}`}>
                                                <div className="flex items-center">
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">Subject DN Rules</span>
                                                    <ReqFieldSourceBadge source={resolvedProfile.fieldSources?.SubjectDnRules} />
                                                </div>
                                                <span className="text-sm text-gray-900 dark:text-white">{resolvedProfile.subjectDnRules || '-'}</span>
                                            </div>
                                            <div className={`pl-3 border-l-2 ${resolvedProfile.fieldSources?.SanRules === 'overridden' ? 'border-l-green-500' : 'border-l-gray-500'}`}>
                                                <div className="flex items-center">
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">SAN Rules</span>
                                                    <ReqFieldSourceBadge source={resolvedProfile.fieldSources?.SanRules} />
                                                </div>
                                                <span className="text-sm text-gray-900 dark:text-white">{resolvedProfile.sanRules || '-'}</span>
                                            </div>
                                            <div className={`pl-3 border-l-2 ${resolvedProfile.fieldSources?.AllowedCertProfileIds === 'overridden' ? 'border-l-green-500' : 'border-l-gray-500'}`}>
                                                <div className="flex items-center">
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">Allowed Cert Profile IDs</span>
                                                    <ReqFieldSourceBadge source={resolvedProfile.fieldSources?.AllowedCertProfileIds} />
                                                </div>
                                                <span className="text-sm text-gray-900 dark:text-white">{resolvedProfile.allowedCertProfileIds || '-'}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-3 flex gap-2">
                                <button onClick={() => startRequestEdit(selectedProfile)}
                                    className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors">
                                    Edit
                                </button>
                            </div>
                        </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RequestProfiles;
