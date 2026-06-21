import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPostWithMfa, apiDeleteWithMfa, apiBlob, api } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import ConfirmModal from '../components/ConfirmModal';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function downloadText(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Blob downloads use apiBlob() so auth + CSRF + refresh
// handling matches the rest of the SPA. The hand-rolled getAuthHeaders helper
// has been removed.
async function downloadBinary(path: string, filename: string) {
    const resp = await apiBlob(path);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* ─── SSH CA Keys Section ─── */
const SshCaKeys: React.FC<{ refreshTrigger: number; onRefresh: () => void }> = ({ refreshTrigger, onRefresh }) => {
    const { showToast } = useToast();
    const { requireStepUp } = useStepUp();
    const [keys, setKeys] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [pendingCeremonies, setPendingCeremonies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [genForm, setGenForm] = useState({ name: '', keyType: 'ed25519', keySize: '', isUserCa: true, isHostCa: false, maxValidityHours: '720', tenantId: '' });
    const [showGenForm, setShowGenForm] = useState(false);
    const [disablingKeyId, setDisablingKeyId] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; title: string; message: string; confirmLabel: string } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            apiGet<any>('/api/v1/admin/ssh/ca-keys'),
            apiGet<any>('/api/v1/admin/tenants'),
            apiGet<any>('/api/v1/admin/ceremonies?status=Pending').catch(() => []),
        ]).then(([keyData, tenantData, ceremonyData]) => {
                if (cancelled) return;
                setKeys(Array.isArray(keyData) ? keyData : (keyData.items || keyData.keys || []));
                setTenants(Array.isArray(tenantData) ? tenantData : (tenantData.items || tenantData.tenants || []));
                const allCeremonies = Array.isArray(ceremonyData) ? ceremonyData : (ceremonyData.items || []);
                setPendingCeremonies(allCeremonies.filter((c: any) =>
                    c.operationType === 'CreateSshCa' || c.operationType === 'DeleteSshCa'));
                setLoading(false);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load SSH CA keys');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [refreshTrigger]);

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setGenerating(true);
        try {
            const result: any = await apiPostWithMfa('/api/v1/admin/ssh/ca-keys', {
                name: genForm.name || 'SSH CA Key',
                keyType: genForm.keyType,
                keySize: genForm.keySize ? parseInt(genForm.keySize) : undefined,
                isUserCa: genForm.isUserCa,
                isHostCa: genForm.isHostCa,
                maxValidityHours: parseInt(genForm.maxValidityHours) || 720,
                tenantId: genForm.tenantId || undefined,
            }, requireStepUp, 'create-ssh-ca');
            if (result?.requiresCeremony) {
                showToast('info', result.message || 'Key ceremony created for approval.');
                setShowGenForm(false);
                setGenForm({ name: '', keyType: 'ed25519', keySize: '', isUserCa: true, isHostCa: false, maxValidityHours: '720', tenantId: '' });
                return;
            }
            setShowGenForm(false);
            setGenForm({ name: '', keyType: 'ed25519', keySize: '', isUserCa: true, isHostCa: false, maxValidityHours: '720', tenantId: '' });
            onRefresh();
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled')
                showToast('error', err.message || 'Failed to generate CA key');
        } finally {
            setGenerating(false);
        }
    };

    const handleDisableKey = (keyId: string, keyName: string) => {
        setConfirmAction({
            title: 'Disable SSH CA Key',
            message: `Are you sure you want to disable "${keyName}"? All active certificates will be revoked. This action cannot be undone.`,
            confirmLabel: 'Disable',
            action: async () => {
                setDisablingKeyId(keyId);
                try {
                    const result: any = await apiDeleteWithMfa(
                        `/api/v1/admin/ssh/ca-keys/${keyId}`,
                        requireStepUp, 'disable-ssh-ca', keyId);
                    if (result?.requiresCeremony) {
                        showToast('info', result.message || 'Key ceremony created for approval.');
                    } else {
                        showToast('success', 'CA key disabled successfully.');
                        onRefresh();
                    }
                } finally {
                    setDisablingKeyId(null);
                }
            },
        });
    };

    const handleDownloadPublicKey = (key: any) => {
        downloadText(key.publicKey, `${key.name || key.id}.pub`);
    };

    const handleDownloadKrl = async (key: any) => {
        try {
            await downloadBinary(`/api/v1/admin/ssh/ca-keys/${key.id}/krl`, 'revoked_keys.krl');
        } catch (err: any) {
            showToast('error', err.message || 'Failed to download KRL');
        }
    };

    // Build a combined list: real keys + pending ceremony placeholders
    const pendingCreateEntries = pendingCeremonies
        .filter((c: any) => c.operationType === 'CreateSshCa')
        .map((c: any) => ({
            id: `ceremony-${c.id}`,
            ceremonyId: c.id,
            name: c.description?.replace(/^Create SSH CA '/, '').replace(/'$/, '') || 'Pending SSH CA',
            keyType: '—',
            isUserCa: false,
            isHostCa: false,
            isEnabled: true,
            isPendingCeremony: true,
            ceremonyStatus: c.status,
            currentApprovals: c.currentApprovals,
            requiredApprovals: c.requiredApprovals,
        }));

    const allKeys = [...pendingCreateEntries, ...keys];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SSH CA Keys</h2>
                <button
                    onClick={() => setShowGenForm(!showGenForm)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors"
                >
                    {showGenForm ? 'Cancel' : 'Generate CA Key'}
                </button>
            </div>

            {showGenForm && (
                <form onSubmit={handleGenerate} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Generate New SSH CA Key</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Name</label>
                            <input
                                type="text"
                                required
                                placeholder="My SSH CA"
                                value={genForm.name}
                                onChange={(e) => setGenForm({ ...genForm, name: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Key Type</label>
                            <select
                                value={genForm.keyType}
                                onChange={(e) => setGenForm({ ...genForm, keyType: e.target.value, keySize: '' })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="ed25519">ed25519</option>
                                <option value="ecdsa">ecdsa</option>
                                <option value="rsa">rsa</option>
                            </select>
                        </div>
                        {genForm.keyType !== 'ed25519' && (
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Key Size</label>
                            <select
                                value={genForm.keySize}
                                onChange={(e) => setGenForm({ ...genForm, keySize: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                            >
                                {genForm.keyType === 'rsa' ? (
                                    <>
                                        <option value="">Default (3072)</option>
                                        <option value="2048">2048 bits</option>
                                        <option value="3072">3072 bits</option>
                                        <option value="4096">4096 bits</option>
                                        <option value="7680">7680 bits (high compute)</option>
                                        <option value="8192">8192 bits (high compute)</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="">Default (256)</option>
                                        <option value="256">P-256 (256 bits)</option>
                                        <option value="384">P-384 (384 bits)</option>
                                        <option value="521">P-521 (521 bits)</option>
                                    </>
                                )}
                            </select>
                            {genForm.keyType === 'rsa' && (genForm.keySize === '7680' || genForm.keySize === '8192') && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                    ⚠ High-compute RSA — key generation may take 30+ seconds.
                                </p>
                            )}
                        </div>
                        )}
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Max Validity (hours)</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={genForm.maxValidityHours}
                                onChange={(e) => setGenForm({ ...genForm, maxValidityHours: e.target.value.replace(/\D/g, '') })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Tenant</label>
                            <select
                                value={genForm.tenantId}
                                onChange={(e) => setGenForm({ ...genForm, tenantId: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="">Select tenant...</option>
                                {tenants.map((t: any) => (
                                    <option key={t.id} value={t.id}>{t.name || t.id}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={genForm.isUserCa} onChange={(e) => setGenForm({ ...genForm, isUserCa: e.target.checked })} className="rounded" />
                            User CA
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" checked={genForm.isHostCa} onChange={(e) => setGenForm({ ...genForm, isHostCa: e.target.checked })} className="rounded" />
                            Host CA
                        </label>
                    </div>
                    <button
                        type="submit"
                        disabled={generating}
                        className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {generating ? 'Generating...' : 'Generate'}
                    </button>
                </form>
            )}

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && keys.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No SSH CA keys configured</div>
                )}
                {!loading && !error && allKeys.map((key) => {
                    const id = key.id || key.fingerprint;
                    const expanded = !key.isPendingCeremony && expandedKey === id;

                    return (
                        <div key={id} className={`border-b border-gray-300 dark:border-gray-700 last:border-b-0 ${key.isPendingCeremony ? 'opacity-70' : ''}`}>
                            <button
                                onClick={() => !key.isPendingCeremony && setExpandedKey(expanded ? null : id)}
                                className={`w-full px-4 py-3 flex items-center gap-2 text-left ${key.isPendingCeremony ? 'cursor-default' : 'hover:bg-gray-200/50 dark:bg-gray-700/50'} transition-colors`}
                            >
                                <span className="text-gray-600 text-xs">{expanded ? '▼' : '▶'}</span>
                                {key.isPendingCeremony
                                    ? <StatusBadge status="pending" label={`Ceremony (${key.currentApprovals}/${key.requiredApprovals})`} />
                                    : key.isEnabled === false
                                        ? <StatusBadge status="revoked" label="Disabled" />
                                        : pendingCeremonies.some((c: any) => c.targetEntityId === key.id && c.operationType === 'DeleteSshCa')
                                            ? <StatusBadge status="pending" label="Disable Pending" />
                                            : <StatusBadge status="active" label="CA Key" />
                                }
                                <span className="text-sm text-gray-900 dark:text-white font-medium">{key.name || 'Unnamed'}</span>
                                <span className="text-xs text-gray-600">{key.keyType || key.algorithm}{key.keySize ? ` (${key.keySize})` : ''}</span>
                                {key.isUserCa && <span className="px-1.5 py-0.5 text-xs bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-400 rounded">User</span>}
                                {key.isHostCa && <span className="px-1.5 py-0.5 text-xs bg-purple-900/50 text-purple-400 rounded">Host</span>}
                                <span className="ml-auto text-xs text-gray-600">{formatDate(key.createdAt)}</span>
                            </button>
                            {expanded && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                    <DetailField label="ID" value={key.id} mono />
                                    <DetailField label="Algorithm" value={`${key.keyType || key.algorithm}${key.keySize ? ` (${key.keySize} bits)` : ''}`} />
                                    <DetailField label="Max Validity" value={`${key.maxValidityHours}h`} />
                                    <DetailField label="Created" value={formatDate(key.createdAt)} />
                                    <DetailField label="Public Key" value={key.publicKey} mono />

                                    <div className="mt-3 flex gap-2 flex-wrap">
                                        <button
                                            onClick={() => handleDownloadPublicKey(key)}
                                            className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            Download Public Key (.pub)
                                        </button>
                                        <button
                                            onClick={() => handleDownloadKrl(key)}
                                            className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            Download KRL
                                        </button>
                                        {key.isEnabled !== false && (
                                            <button
                                                onClick={() => handleDisableKey(key.id, key.name)}
                                                disabled={disablingKeyId === key.id}
                                                className="px-3 py-1.5 text-xs bg-red-800 text-red-800 dark:text-red-200 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                                            >
                                                {disablingKeyId === key.id ? 'Disabling...' : 'Disable'}
                                            </button>
                                        )}
                                    </div>

                                    <div className="mt-3 p-3 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-600 dark:text-gray-400 space-y-1">
                                        {key.isUserCa && (
                                            <p>
                                                <span className="text-gray-700 dark:text-gray-300 font-medium">User CA:</span>{' '}
                                                Add to <code className="text-blue-800 dark:text-blue-400">TrustedUserCAKeys</code> in sshd_config
                                            </p>
                                        )}
                                        {key.isHostCa && (
                                            <p>
                                                <span className="text-gray-700 dark:text-gray-300 font-medium">Host CA:</span>{' '}
                                                Add to <code className="text-blue-800 dark:text-blue-400">known_hosts</code> with{' '}
                                                <code className="text-blue-800 dark:text-blue-400">@cert-authority * {key.publicKey?.split(' ').slice(0, 2).join(' ')}...</code>
                                            </p>
                                        )}
                                        <p>
                                            <span className="text-gray-700 dark:text-gray-300 font-medium">Public URL:</span>{' '}
                                            <code className="text-blue-800 dark:text-blue-400">/ssh/ca-keys/{key.id}/public-key</code>
                                        </p>
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
                confirmLabel={confirmAction?.confirmLabel || 'Confirm'}
                confirmClass="bg-red-600 hover:bg-red-700"
                loading={confirmLoading}
                onConfirm={async () => {
                    if (!confirmAction) return;
                    setConfirmLoading(true);
                    try {
                        await confirmAction.action();
                    } catch (err: any) {
                        if (err.message !== 'Step-up MFA cancelled')
                            showToast('error', err.message || 'Action failed');
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

/* ─── Helpers ─── */
function parseJsonArray(val: any): string[] {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed; } catch { }
    }
    return [];
}

/* ─── SSH Certificates Section ─── */
const SshCerts: React.FC<{ refreshTrigger: number; onRefresh: () => void; caKeys: any[] }> = ({ refreshTrigger, onRefresh, caKeys }) => {
    const { showToast } = useToast();
    const [certs, setCerts] = useState<any[]>([]);
    const [signingProfiles, setSigningProfiles] = useState<any[]>([]);
    const [certProfiles, setCertProfiles] = useState<any[]>([]);
    const [requestProfiles, setRequestProfiles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [showSignForm, setShowSignForm] = useState(false);
    const [signForm, setSignForm] = useState({ certType: 'user' as 'user' | 'host', sshRequestProfileId: '', sshSigningProfileId: '', sshCertProfileId: '', publicKey: '', identity: '', principals: '', validityHours: '' });
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [signing, setSigning] = useState(false);
    const [signResult, setSignResult] = useState<any>(null);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [selectedCaKeyId, setSelectedCaKeyId] = useState<string>('');

    // Auto-select first CA key when available
    useEffect(() => {
        if (caKeys.length > 0 && !selectedCaKeyId) {
            setSelectedCaKeyId(caKeys[0].id);
        }
    }, [caKeys]);

    useEffect(() => {
        if (!selectedCaKeyId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            apiGet<any>(`/api/v1/admin/ssh/ca-keys/${selectedCaKeyId}/certificates`),
            apiGet<any>('/api/v1/admin/ssh/profiles/signing'),
            apiGet<any>('/api/v1/admin/ssh/profiles/cert'),
            apiGet<any>('/api/v1/admin/ssh/profiles/request'),
        ]).then(([certData, signingData, certProfData, reqProfData]) => {
                if (cancelled) return;
                setCerts(Array.isArray(certData) ? certData : (certData.items || certData.certificates || []));
                setSigningProfiles(Array.isArray(signingData) ? signingData : []);
                setCertProfiles(Array.isArray(certProfData) ? certProfData : []);
                setRequestProfiles(Array.isArray(reqProfData) ? reqProfData : []);
                setLoading(false);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load SSH data');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [refreshTrigger, selectedCaKeyId]);

    // Derive allowed signing/cert profiles from the selected request profile
    const selectedRequestProfile = requestProfiles.find((p: any) => p.id === signForm.sshRequestProfileId);
    const allowedSigningIds = new Set(parseJsonArray(selectedRequestProfile?.allowedSshSigningProfileIds));
    const allowedCertIds = new Set(parseJsonArray(selectedRequestProfile?.allowedSshCertProfileIds));

    // Filter signing profiles by: matches selected CA key AND allowed in request profile AND matches cert type (user/host)
    const filteredSigningProfiles = signingProfiles.filter((p: any) => {
        if (p.sshCaKeyId !== selectedCaKeyId) return false;
        if (allowedSigningIds.size > 0 && !allowedSigningIds.has(p.id)) return false;
        if (signForm.certType === 'user' && !p.allowUserCerts) return false;
        if (signForm.certType === 'host' && !p.allowHostCerts) return false;
        return true;
    });
    const filteredCertProfiles = certProfiles.filter((p: any) =>
        allowedCertIds.size === 0 || allowedCertIds.has(p.id)
    );

    const selectedSigningProfile = signingProfiles.find((p: any) => p.id === signForm.sshSigningProfileId);
    const selectedCertProfile = certProfiles.find((p: any) => p.id === signForm.sshCertProfileId);

    // Compute the effective max validity from the strictest of the three profiles
    const effectiveMaxValidity = Math.min(
        selectedRequestProfile?.maxValidityHours ?? Infinity,
        selectedSigningProfile?.maxValidityHours ?? Infinity,
        selectedCertProfile?.maxValidityHours ?? Infinity,
    );

    // Auto-select first available when request profile changes
    useEffect(() => {
        if (!signForm.sshRequestProfileId) return;
        const newSigning = filteredSigningProfiles.length > 0 ? filteredSigningProfiles[0].id : '';
        const newCert = filteredCertProfiles.length > 0 ? filteredCertProfiles[0].id : '';
        setSignForm(prev => ({
            ...prev,
            sshSigningProfileId: filteredSigningProfiles.some((p: any) => p.id === prev.sshSigningProfileId) ? prev.sshSigningProfileId : newSigning,
            sshCertProfileId: filteredCertProfiles.some((p: any) => p.id === prev.sshCertProfileId) ? prev.sshCertProfileId : newCert,
        }));
    }, [signForm.sshRequestProfileId, signForm.certType]);

    // Client-side validation against profile constraints
    useEffect(() => {
        if (!showSignForm || !signForm.sshRequestProfileId) { setValidationErrors([]); return; }
        const errors: string[] = [];
        const principals = signForm.principals.split(',').map(s => s.trim()).filter(Boolean);

        // Validity hours
        const hours = parseInt(signForm.validityHours);
        if (signForm.validityHours && hours > 0 && effectiveMaxValidity < Infinity && hours > effectiveMaxValidity) {
            errors.push(`Validity ${hours}h exceeds maximum allowed ${effectiveMaxValidity}h`);
        }

        // Principal count (cert profile)
        if (selectedCertProfile && principals.length > selectedCertProfile.maxPrincipals) {
            errors.push(`Too many ${signForm.certType === 'user' ? 'principals' : 'hostnames'}: ${principals.length} (max ${selectedCertProfile.maxPrincipals})`);
        }

        // Principal pattern validation (cert profile)
        if (selectedCertProfile && principals.length > 0) {
            const patterns = parseJsonArray(selectedCertProfile.allowedPrincipalPatterns);
            if (patterns.length > 0) {
                const regexes = patterns.map((p: string) => { try { return new RegExp(p); } catch { return null; } }).filter(Boolean) as RegExp[];
                for (const principal of principals) {
                    if (!regexes.some(rx => rx.test(principal))) {
                        errors.push(`"${principal}" does not match any allowed principal pattern`);
                    }
                }
            }
        }

        setValidationErrors(errors);
    }, [signForm.principals, signForm.validityHours, selectedCertProfile, selectedSigningProfile, selectedRequestProfile, effectiveMaxValidity, showSignForm]);

    // Profile selection is complete when all three are chosen
    const profilesSelected = !!(signForm.sshRequestProfileId && signForm.sshSigningProfileId && signForm.sshCertProfileId);

    const handleSign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCaKeyId) { showToast('warning', 'Please select a CA key first.'); return; }
        if (validationErrors.length > 0) { showToast('error', 'Fix validation errors before submitting.'); return; }
        setSigning(true);
        setSignResult(null);
        try {
            const endpoint = signForm.certType === 'user'
                ? `/api/v1/admin/ssh/ca-keys/${selectedCaKeyId}/certificates/sign-user`
                : `/api/v1/admin/ssh/ca-keys/${selectedCaKeyId}/certificates/sign-host`;

            const body: any = {
                sshSigningProfileId: signForm.sshSigningProfileId,
                sshCertProfileId: signForm.sshCertProfileId,
                publicKey: signForm.publicKey,
                keyId: signForm.identity,
                validityHours: parseInt(signForm.validityHours) || undefined,
            };

            if (signForm.certType === 'user') {
                body.principals = signForm.principals.split(',').map((p: string) => p.trim()).filter(Boolean);
            } else {
                body.hostnames = signForm.principals.split(',').map((p: string) => p.trim()).filter(Boolean);
            }

            const result = await apiPost(endpoint, body);
            setSignResult(result);
            setShowSignForm(false);
            setSignForm({ certType: 'user', sshRequestProfileId: '', sshSigningProfileId: '', sshCertProfileId: '', publicKey: '', identity: '', principals: '', validityHours: '' });
            onRefresh();
        } catch (err: any) {
            showToast('error', err.message || 'Signing failed');
        } finally {
            setSigning(false);
        }
    };

    const handleRevoke = async (certId: string) => {
        if (!confirm('Are you sure you want to revoke this SSH certificate? This action cannot be undone.')) return;
        if (!selectedCaKeyId) { showToast('warning', 'Please select a CA key first.'); return; }
        setRevoking(certId);
        try {
            await apiPost(`/api/v1/admin/ssh/ca-keys/${selectedCaKeyId}/certificates/${certId}/revoke`, {});
            onRefresh();
        } catch (err: any) {
            showToast('error', err.message || 'Revocation failed');
        } finally {
            setRevoking(null);
        }
    };

    const handleDownloadCert = async (cert: any) => {
        try {
            // Route through apiBlob.
            const resp = await apiBlob(`/api/v1/admin/ssh/certificates/${cert.id}/download`);
            const text = await resp.text();
            downloadText(text, `${cert.keyId || cert.id}-cert.pub`);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to download certificate');
        }
    };

    const parsePrincipals = (val: any): string[] => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
            try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed; } catch { }
            return val.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        return [];
    };

    const parseExtensions = (val: any): string[] => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
            try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed; } catch { }
            return [val];
        }
        return [];
    };

    return (
        <div className="space-y-4">
            {/* CA Key Selector */}
            <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 dark:text-gray-400 font-medium">CA Key:</label>
                <select
                    value={selectedCaKeyId}
                    onChange={(e) => setSelectedCaKeyId(e.target.value)}
                    className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                    {caKeys.filter(k => k.isEnabled !== false).length === 0 && <option value="">No CA keys available</option>}
                    {caKeys.filter(k => k.isEnabled !== false).map((k: any) => (
                        <option key={k.id} value={k.id}>{k.name || k.id} ({k.keyType || k.algorithm})</option>
                    ))}
                </select>
            </div>

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SSH Certificates</h2>
                <button
                    onClick={() => { setShowSignForm(!showSignForm); setSignResult(null); }}
                    disabled={!selectedCaKeyId}
                    className="px-4 py-2 text-sm bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                    {showSignForm ? 'Cancel' : 'Sign Key'}
                </button>
            </div>

            {/* Sign Form */}
            {showSignForm && (
                <form onSubmit={handleSign} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Sign {signForm.certType === 'user' ? 'User' : 'Host'} Key
                    </h3>

                    {/* Certificate Type */}
                    <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Certificate Type</label>
                        <select
                            value={signForm.certType}
                            onChange={(e) => setSignForm({ ...signForm, certType: e.target.value as 'user' | 'host', sshSigningProfileId: '', sshCertProfileId: '' })}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="user">User Certificate</option>
                            <option value="host">Host Certificate</option>
                        </select>
                    </div>

                    {/* Step 1: Profile Selection */}
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Request Profile</label>
                                <select
                                    required
                                    value={signForm.sshRequestProfileId}
                                    onChange={(e) => setSignForm({ ...signForm, sshRequestProfileId: e.target.value, sshSigningProfileId: '', sshCertProfileId: '' })}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                >
                                    <option value="">Select request profile...</option>
                                    {requestProfiles.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Signing Profile</label>
                                <select
                                    required
                                    disabled={!signForm.sshRequestProfileId}
                                    value={signForm.sshSigningProfileId}
                                    onChange={(e) => setSignForm({ ...signForm, sshSigningProfileId: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                                >
                                    <option value="">Select signing profile...</option>
                                    {filteredSigningProfiles.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                {signForm.sshRequestProfileId && filteredSigningProfiles.length === 0 && (
                                    <p className="text-xs text-red-800 dark:text-red-400 mt-1">No {signForm.certType} signing profiles allowed by this request profile</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cert Profile</label>
                                <select
                                    required
                                    disabled={!signForm.sshRequestProfileId}
                                    value={signForm.sshCertProfileId}
                                    onChange={(e) => setSignForm({ ...signForm, sshCertProfileId: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                                >
                                    <option value="">Select cert profile...</option>
                                    {filteredCertProfiles.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                {signForm.sshRequestProfileId && filteredCertProfiles.length === 0 && (
                                    <p className="text-xs text-red-800 dark:text-red-400 mt-1">No cert profiles allowed by this request profile</p>
                                )}
                            </div>
                        </div>

                        {/* Profile constraint summary */}
                        {profilesSelected && (
                            <div className="p-2 bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                                <span>Max validity: <span className="text-gray-900 dark:text-white font-medium">{effectiveMaxValidity === Infinity ? 'unlimited' : `${effectiveMaxValidity}h`}</span></span>
                                {selectedCertProfile && <span>Max principals: <span className="text-gray-900 dark:text-white font-medium">{selectedCertProfile.maxPrincipals}</span></span>}
                                {selectedSigningProfile?.forceCommand && <span>Force command: <span className="text-gray-900 dark:text-white font-medium font-mono">{selectedSigningProfile.forceCommand}</span></span>}
                                {selectedCertProfile && parseJsonArray(selectedCertProfile.allowedPrincipalPatterns).length > 0 && (
                                    <span>Principal patterns: <span className="text-gray-900 dark:text-white font-medium font-mono">{parseJsonArray(selectedCertProfile.allowedPrincipalPatterns).join(', ')}</span></span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Step 2: Certificate Details (disabled until profiles are selected) */}
                    <fieldset disabled={!profilesSelected} className={!profilesSelected ? 'opacity-40' : ''}>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Public Key</label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="ssh-ed25519 AAAA..."
                                    value={signForm.publicKey}
                                    onChange={(e) => setSignForm({ ...signForm, publicKey: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white font-mono placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Identity (Key ID)</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder={signForm.certType === 'user' ? 'username' : 'hostname'}
                                        value={signForm.identity}
                                        onChange={(e) => setSignForm({ ...signForm, identity: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                        {signForm.certType === 'user' ? 'Principals' : 'Hostnames'} (comma-separated)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder={signForm.certType === 'user' ? 'root,admin' : 'web01.example.com'}
                                        value={signForm.principals}
                                        onChange={(e) => setSignForm({ ...signForm, principals: e.target.value })}
                                        className={`w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 ${
                                            validationErrors.some(e => e.includes('principal') || e.includes('hostname')) ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                        Validity (hours){effectiveMaxValidity < Infinity ? ` (max ${effectiveMaxValidity})` : ''}
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder={effectiveMaxValidity < Infinity ? String(effectiveMaxValidity) : '720'}
                                        value={signForm.validityHours}
                                        onChange={(e) => setSignForm({ ...signForm, validityHours: e.target.value.replace(/\D/g, '') })}
                                        className={`w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 ${
                                            validationErrors.some(e => e.includes('Validity')) ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'
                                        }`}
                                    />
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    {/* Validation errors */}
                    {validationErrors.length > 0 && (
                        <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded text-xs text-red-800 dark:text-red-400 space-y-0.5">
                            {validationErrors.map((err, i) => <p key={i}>{err}</p>)}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={signing || !profilesSelected || validationErrors.length > 0}
                            className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            {signing ? 'Signing...' : 'Sign Key'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowSignForm(false); setSignResult(null); setValidationErrors([]); setSignForm({ certType: 'user', sshRequestProfileId: '', sshSigningProfileId: '', sshCertProfileId: '', publicKey: '', identity: '', principals: '', validityHours: '' }); }}
                            className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* Sign Result */}
            {signResult && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-green-300 dark:border-green-700 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="text-green-800 dark:text-green-400 font-semibold text-sm">Certificate Signed Successfully</span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <p><span className="text-gray-700 dark:text-gray-300">Key ID:</span> {signResult.keyId}</p>
                        <p><span className="text-gray-700 dark:text-gray-300">Serial:</span> {signResult.serialNumber}</p>
                        <p><span className="text-gray-700 dark:text-gray-300">Valid:</span> {formatDate(signResult.validAfter)} - {formatDate(signResult.validBefore)}</p>
                    </div>
                    {signResult.signedCertificate && (
                        <>
                            <textarea
                                readOnly
                                rows={3}
                                value={signResult.signedCertificate}
                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs text-gray-700 dark:text-gray-300 font-mono focus:outline-none"
                            />
                            <button
                                onClick={() => downloadText(signResult.signedCertificate, `${signResult.keyId}-cert.pub`)}
                                className="px-3 py-1.5 text-xs bg-green-700 text-gray-900 dark:text-white rounded hover:bg-green-600 transition-colors"
                            >
                                Download Certificate (-cert.pub)
                            </button>
                        </>
                    )}
                    <p className="text-xs text-gray-600">
                        Save this as <code className="text-blue-800 dark:text-blue-400">~/.ssh/id_ed25519-cert.pub</code> alongside your private key.
                    </p>
                </div>
            )}

            {/* Certificate List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                {!loading && !error && certs.length === 0 && (
                    <div className="p-4 text-sm text-gray-600 text-center">No SSH certificates issued</div>
                )}
                {!loading && !error && certs.map((cert) => {
                    const key = cert.id || cert.serial || cert.fingerprint;
                    const expanded = expandedKey === key;
                    const isUser = (cert.certificateType || cert.type || cert.certType || '').toLowerCase().includes('user');
                    const isRevoked = cert.isRevoked;
                    const principals = parsePrincipals(cert.principals);
                    const extensions = parseExtensions(cert.extensions);

                    return (
                        <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                            <button
                                onClick={() => setExpandedKey(expanded ? null : key)}
                                className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors"
                            >
                                <span className="text-gray-600 text-xs">{expanded ? '▼' : '▶'}</span>
                                {isRevoked
                                    ? <StatusBadge status="revoked" label="Revoked" />
                                    : <StatusBadge status={isUser ? 'pending' : 'active'} label={isUser ? 'User' : 'Host'} />
                                }
                                <span className={`text-sm ${isRevoked ? 'text-gray-600 line-through' : 'text-gray-900 dark:text-white'}`}>
                                    {cert.keyId || cert.identity}
                                </span>
                                <span className="font-mono text-xs text-gray-600">#{cert.serialNumber || cert.serial}</span>
                                <span className="text-xs text-gray-600 truncate">{principals.join(', ')}</span>
                                <span className="ml-auto text-xs text-gray-600">{formatDate(cert.validBefore || cert.expiresAt)}</span>
                            </button>
                            {expanded && (
                                <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                    <DetailField label="ID" value={cert.id} mono />
                                    <DetailField label="Serial" value={cert.serialNumber || cert.serial} mono />
                                    <DetailField label="Type" value={cert.certificateType || cert.type || cert.certType} />
                                    <DetailField label="Key ID" value={cert.keyId || cert.identity} />
                                    <DetailField label="Principals" value={principals.join(', ')} />
                                    <DetailField label="Valid After" value={formatDate(cert.validAfter || cert.issuedAt)} />
                                    <DetailField label="Valid Before" value={formatDate(cert.validBefore || cert.expiresAt)} />
                                    <DetailField label="CA Key ID" value={cert.sshCaKeyId} mono />
                                    {extensions.length > 0 && <DetailField label="Extensions" value={extensions.join(', ')} />}
                                    <DetailField label="Revoked" value={isRevoked ? 'Yes' : 'No'} />
                                    <DetailField label="Issued By" value={cert.issuedByUserId || '-'} mono />
                                    <DetailField label="Source IP" value={cert.sourceIp || '-'} />

                                    <div className="mt-3 flex gap-2 flex-wrap">
                                        <button
                                            onClick={() => handleDownloadCert(cert)}
                                            className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            Download Certificate
                                        </button>
                                        {!isRevoked && (
                                            <button
                                                onClick={() => handleRevoke(cert.id)}
                                                disabled={revoking === cert.id}
                                                className="px-3 py-1.5 text-xs bg-red-800 text-red-800 dark:text-red-200 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                                            >
                                                {revoking === cert.id ? 'Revoking...' : 'Revoke'}
                                            </button>
                                        )}
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

/* ─── SSH Certificates Page ─── */
const SshCertificates: React.FC = () => {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [caKeys, setCaKeys] = useState<any[]>([]);
    const refresh = () => setRefreshTrigger((t) => t + 1);

    // Load CA keys for the certificate section's CA key selector
    useEffect(() => {
        apiGet<any>('/api/v1/admin/ssh/ca-keys')
            .then((data) => {
                setCaKeys(Array.isArray(data) ? data : (data.items || data.keys || []));
            })
            .catch(() => {});
    }, [refreshTrigger]);

    return (
        <div className="p-6 space-y-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SSH Certificates</h1>
            <SshCaKeys refreshTrigger={refreshTrigger} onRefresh={refresh} />
            <SshCerts refreshTrigger={refreshTrigger} onRefresh={refresh} caKeys={caKeys} />
        </div>
    );
};

export default SshCertificates;
