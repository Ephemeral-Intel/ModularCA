import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPostWithMfa, apiDeleteWithMfa } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import ConfirmModal from '../components/ConfirmModal';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type CeremonyStatus = 'Pending' | 'Approved' | 'Rejected' | 'Executed' | 'Expired' | 'Cancelled';

function ceremonyBadgeStatus(status: CeremonyStatus): 'expired' | 'active' | 'revoked' | 'pending' | 'disabled' {
    switch (status) {
        case 'Pending': return 'expired';     // yellow
        case 'Approved': return 'active';     // green
        case 'Rejected': return 'revoked';    // red
        case 'Executed': return 'pending';    // blue
        case 'Expired': return 'disabled';    // gray
        case 'Cancelled': return 'disabled';  // gray (neutral, similar to Expired)
        default: return 'disabled';
    }
}

const KEY_ALGORITHMS = [
    'RSA', 'ECDSA', 'Ed25519', 'Ed448',
    'ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87',
    'SLH-DSA-SHA2-128F',
];

function isFixedSizeAlgorithm(alg: string): boolean {
    return alg === 'Ed25519' || alg === 'Ed448' || alg.startsWith('ML-DSA') || alg.startsWith('SLH-DSA');
}

/// <summary>
/// Key Ceremonies management page for initiating, approving, rejecting, executing, and cancelling
/// key ceremony operations with step-up MFA enforcement. The create form captures full CA
/// creation parameters (KeyCeremonyParameters) which are locked at initiation.
/// </summary>
const KeyCeremonies: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [ceremonies, setCeremonies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [expandedDetail, setExpandedDetail] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [executing, setExecuting] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; title: string; message: string; confirmLabel: string } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Create form fields
    const [formOperationType, setFormOperationType] = useState('CreateRootCA');
    const [formDescription, setFormDescription] = useState('');
    const [formSubjectCN, setFormSubjectCN] = useState('');
    const [formSubjectO, setFormSubjectO] = useState('');
    const [formSubjectOU, setFormSubjectOU] = useState('');
    const [formSubjectL, setFormSubjectL] = useState('');
    const [formSubjectST, setFormSubjectST] = useState('');
    const [formSubjectC, setFormSubjectC] = useState('');
    const [formKeyAlgorithm, setFormKeyAlgorithm] = useState('ECDSA');
    const [formKeySize, setFormKeySize] = useState('384');
    const [formValidityYears, setFormValidityYears] = useState('10');
    const [formTenantId, setFormTenantId] = useState('');
    const [formParentCaId, setFormParentCaId] = useState('');
    const [formCertProfileId, setFormCertProfileId] = useState('');
    const [formLabel, setFormLabel] = useState('');
    const [formPublicBaseUrl, setFormPublicBaseUrl] = useState('');
    const [nameConstraintsPermittedText, setNameConstraintsPermittedText] = useState('');
    const [nameConstraintsExcludedText, setNameConstraintsExcludedText] = useState('');

    // Reference data
    const [tenants, setTenants] = useState<any[]>([]);
    const [allCas, setAllCas] = useState<any[]>([]);
    const [caCertProfiles, setCaCertProfiles] = useState<any[]>([]);

    // Current user (for self-approval check)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const flattenCas = (cas: any[]): any[] => {
        const result: any[] = [];
        for (const ca of cas) {
            result.push(ca);
            if (ca.children && ca.children.length > 0) {
                result.push(...flattenCas(ca.children));
            }
        }
        return result;
    };

    const fetchCeremonies = useCallback(async () => {
        try {
            const data = await apiGet<any>('/api/v1/admin/ceremonies');
            const list = Array.isArray(data) ? data : (data.items || data.ceremonies || []);
            setCeremonies(list);
        } catch (err: any) {
            setError(err.message || 'Failed to load ceremonies');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        setError(null);
        fetchCeremonies();

        // Fetch current user id
        apiGet<any>('/api/v1/account')
            .then((me) => setCurrentUserId(me?.id || me?.userId || null))
            .catch(() => {});

        // Fetch reference data for the create form
        apiGet<any>('/api/v1/admin/tenants')
            .then(data => setTenants(Array.isArray(data) ? data : data.items || []))
            .catch(() => {});

        apiGet<any>('/api/v1/admin/authorities/hierarchy')
            .then(data => {
                const items = Array.isArray(data) ? data : (data.items || data.authorities || []);
                setAllCas(flattenCas(items));
            })
            .catch(() => {});

        apiGet<any>('/api/v1/admin/cert-profiles?isCaProfile=true')
            .then(data => {
                const items = Array.isArray(data) ? data : (data.items || []);
                setCaCertProfiles(items);
                if (items.length > 0 && !formCertProfileId) setFormCertProfileId(items[0].id);
            })
            .catch(() => {});
    }, [refreshTrigger, fetchCeremonies]);

    // Auto-refresh every 30 seconds for pending ceremonies
    useEffect(() => {
        const hasPending = ceremonies.some((c) => c.status === 'Pending');
        if (!hasPending) return;

        const interval = setInterval(() => {
            fetchCeremonies();
        }, 30000);
        return () => clearInterval(interval);
    }, [ceremonies, fetchCeremonies]);

    // Fetch ceremony detail when expanded
    const handleExpand = async (ceremonyId: string) => {
        if (expandedKey === ceremonyId) {
            setExpandedKey(null);
            setExpandedDetail(null);
            return;
        }
        setExpandedKey(ceremonyId);
        setDetailLoading(true);
        try {
            const detail = await apiGet<any>(`/api/v1/admin/ceremonies/${ceremonyId}`);
            setExpandedDetail(detail);
        } catch {
            setExpandedDetail(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const parseNameConstraints = (text: string): string[] => {
        return text.split('\n').map(s => s.trim()).filter(Boolean);
    };

    const resetCreateForm = () => {
        setFormOperationType('CreateRootCA');
        setFormDescription('');
        setFormSubjectCN('');
        setFormSubjectO('');
        setFormSubjectOU('');
        setFormSubjectL('');
        setFormSubjectST('');
        setFormSubjectC('');
        setFormKeyAlgorithm('ECDSA');
        setFormKeySize('384');
        setFormValidityYears('10');
        setFormTenantId('');
        setFormParentCaId('');
        setFormLabel('');
        setFormPublicBaseUrl('');
        setNameConstraintsPermittedText('');
        setNameConstraintsExcludedText('');
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const permitted = parseNameConstraints(nameConstraintsPermittedText);
            const excluded = parseNameConstraints(nameConstraintsExcludedText);

            await apiPostWithMfa(
                '/api/v1/admin/ceremonies',
                {
                    operationType: formOperationType,
                    description: formDescription,
                    targetEntityId: null,
                    parameters: {
                        subjectCN: formSubjectCN,
                        subjectO: formSubjectO || null,
                        subjectOU: formSubjectOU || null,
                        subjectL: formSubjectL || null,
                        subjectST: formSubjectST || null,
                        subjectC: formSubjectC || null,
                        keyAlgorithm: formKeyAlgorithm,
                        keySize: parseInt(formKeySize, 10),
                        validityYears: parseInt(formValidityYears, 10),
                        tenantId: formTenantId,
                        parentCaId: formOperationType === 'CreateIntermediateCA' ? formParentCaId || null : null,
                        certProfileId: formCertProfileId || null,
                        label: formLabel || null,
                        publicBaseUrl: formPublicBaseUrl || null,
                        nameConstraintsPermitted: permitted.length > 0 ? permitted : null,
                        nameConstraintsExcluded: excluded.length > 0 ? excluded : null,
                    },
                },
                requireStepUp,
                'initiate-ceremony',
            );
            showToast('success', 'Key ceremony initiated successfully.');
            setShowCreate(false);
            resetCreateForm();
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to initiate ceremony');
            }
        } finally {
            setCreating(false);
        }
    };

    const handleApprove = async (ceremony: any) => {
        try {
            await apiPostWithMfa(
                `/api/v1/admin/ceremonies/${ceremony.id}/approve`,
                {},
                requireStepUp,
                'approve-ceremony',
                ceremony.id,
            );
            showToast('success', 'Ceremony approved.');
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to approve ceremony');
            }
        }
    };

    const handleReject = (ceremony: any) => {
        setConfirmAction({
            title: 'Reject Ceremony',
            message: `Are you sure you want to reject "${ceremony.description || ceremony.operationType}"? This action is permanent and cannot be undone.`,
            confirmLabel: 'Reject',
            action: async () => {
                await apiPostWithMfa(
                    `/api/v1/admin/ceremonies/${ceremony.id}/reject`,
                    {},
                    requireStepUp,
                    'reject-ceremony',
                    ceremony.id,
                );
                showToast('success', 'Ceremony rejected.');
                setRefreshTrigger((t) => t + 1);
            },
        });
    };

    const handleCancel = (ceremony: any) => {
        setConfirmAction({
            title: 'Cancel Ceremony',
            message: `Are you sure you want to cancel "${ceremony.description || ceremony.operationType}"? This action cannot be undone.`,
            confirmLabel: 'Cancel Ceremony',
            action: async () => {
                await apiDeleteWithMfa(
                    `/api/v1/admin/ceremonies/${ceremony.id}`,
                    requireStepUp,
                    'cancel-ceremony',
                    ceremony.id,
                );
                showToast('success', 'Ceremony cancelled.');
                setRefreshTrigger((t) => t + 1);
            },
        });
    };

    const handleExecute = async (ceremony: any) => {
        setExecuting(ceremony.id);
        try {
            const result = await apiPostWithMfa<any>(
                `/api/v1/admin/ceremonies/${ceremony.id}/execute`,
                {},
                requireStepUp,
                'execute-ceremony',
                ceremony.id,
            );
            showToast('success', result?.message || 'Ceremony executed successfully.');
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') {
                showToast('error', err.message || 'Failed to execute ceremony');
            }
        } finally {
            setExecuting(null);
        }
    };

    const parseApprovalLog = (json: string | null): any[] => {
        if (!json) return [];
        try {
            return JSON.parse(json);
        } catch {
            return [];
        }
    };

    const parseParameters = (json: string | null): any | null => {
        if (!json) return null;
        try {
            return JSON.parse(json);
        } catch {
            return null;
        }
    };

    /// <summary>
    /// Returns true when the ceremony is a tenant-policy-change variant. The backend enum
    /// CeremonyType (0=CaCreation, 1=TenantPolicyChange) is not currently projected by the
    /// admin ceremony endpoints, so we accept either the string form ("TenantPolicyChange"),
    /// the int form (1) if a future controller change surfaces it, or fall back to the
    /// operationType literal "TenantPolicyChange" which the ceremony service records.
    /// </summary>
    const isTenantPolicyChange = (ceremony: any): boolean => {
        const ct = ceremony?.ceremonyType;
        if (ct === 'TenantPolicyChange' || ct === 1) return true;
        return ceremony?.operationType === 'TenantPolicyChange';
    };

    const isInitiator = (ceremony: any) => {
        return currentUserId && (ceremony.initiatedByUserId === currentUserId || ceremony.initiatorId === currentUserId || ceremony.initiatedBy === currentUserId);
    };

    const isApproverOrInitiator = (ceremony: any) => {
        if (isInitiator(ceremony)) return true;
        if (!currentUserId) return false;
        const approvalsJson = expandedDetail?.approvalsJson || ceremony.approvalsJson;
        if (approvalsJson && approvalsJson.includes(currentUserId)) return true;
        return false;
    };

    const inputClass = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500';
    const labelClass = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1';

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Key Ceremonies</h1>
            </div>

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Start a Ceremony</h3>
                <p className="text-xs text-gray-600 mb-3">
                    Ceremonies are created automatically when performing CA operations on tenants with ceremony enforcement enabled.
                </p>
                <div className="flex flex-wrap gap-2">
                    <a href="/admin/authorities/manage" className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                        Create a CA
                    </a>
                    <a href="/admin/certificates" className="px-4 py-2 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                        Revoke a Certificate
                    </a>
                </div>
            </div>

            {/* Create Ceremony Form — ceremonies are now initiated from CA Management page */}
            {false && showCreate && (
                <form onSubmit={handleCreate} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Initiate Key Ceremony</h3>

                    {/* Operation Type & Description */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Operation Type *</label>
                            <select
                                value={formOperationType}
                                onChange={(e) => {
                                    setFormOperationType(e.target.value);
                                    if (e.target.value === 'CreateRootCA') setFormValidityYears('25');
                                    else setFormValidityYears('10');
                                }}
                                className={inputClass}
                            >
                                <option value="CreateRootCA">Create Root CA</option>
                                <option value="CreateIntermediateCA">Create Intermediate CA</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Description *</label>
                            <input
                                type="text"
                                placeholder="Describe the ceremony purpose"
                                required
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* Tenant & Scope */}
                    <div className="border-t border-gray-300 dark:border-gray-700 pt-3">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Scope</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                            <div>
                                <label className={labelClass}>Tenant *</label>
                                <select value={formTenantId} onChange={(e) => setFormTenantId(e.target.value)} className={inputClass} required>
                                    <option value="">-- Select Tenant --</option>
                                    {tenants.filter(t => t.isEnabled).map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                            {formOperationType === 'CreateIntermediateCA' && (
                                <div>
                                    <label className={labelClass}>Parent CA *</label>
                                    <select value={formParentCaId} onChange={(e) => setFormParentCaId(e.target.value)} className={inputClass} required>
                                        <option value="">-- Select Parent CA --</option>
                                        {allCas.map(ca => {
                                            const id = ca.id || ca.certificateId || ca.name;
                                            return <option key={id} value={id}>{ca.name || ca.subjectDN}</option>;
                                        })}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className={labelClass}>CA Certificate Profile</label>
                                <select value={formCertProfileId} onChange={(e) => setFormCertProfileId(e.target.value)} className={inputClass}>
                                    {caCertProfiles.length === 0 && <option value="">No CA profiles available</option>}
                                    {caCertProfiles.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Subject DN */}
                    <div className="border-t border-gray-300 dark:border-gray-700 pt-3">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Subject</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                            <div>
                                <label className={labelClass}>Common Name (CN) *</label>
                                <input type="text" value={formSubjectCN} onChange={(e) => setFormSubjectCN(e.target.value)} placeholder={formOperationType === 'CreateRootCA' ? 'My Root CA' : 'My Intermediate CA'} required className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Organization (O)</label>
                                <input type="text" value={formSubjectO} onChange={(e) => setFormSubjectO(e.target.value)} placeholder="Acme Corp" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Organizational Unit (OU)</label>
                                <input type="text" value={formSubjectOU} onChange={(e) => setFormSubjectOU(e.target.value)} placeholder="IT Security" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Locality (L)</label>
                                <input type="text" value={formSubjectL} onChange={(e) => setFormSubjectL(e.target.value)} placeholder="San Francisco" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>State (ST)</label>
                                <input type="text" value={formSubjectST} onChange={(e) => setFormSubjectST(e.target.value)} placeholder="California" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Country (C)</label>
                                <input type="text" value={formSubjectC} onChange={(e) => setFormSubjectC(e.target.value)} placeholder="US" maxLength={2} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    {/* Key Configuration */}
                    <div className="border-t border-gray-300 dark:border-gray-700 pt-3">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Key Configuration</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                            <div>
                                <label className={labelClass}>Key Algorithm</label>
                                <select value={formKeyAlgorithm} onChange={(e) => setFormKeyAlgorithm(e.target.value)} className={inputClass}>
                                    {KEY_ALGORITHMS.map(alg => <option key={alg} value={alg}>{alg}</option>)}
                                </select>
                            </div>
                            {!isFixedSizeAlgorithm(formKeyAlgorithm) && (
                                <div>
                                    <label className={labelClass}>Key Size</label>
                                    <select value={formKeySize} onChange={(e) => setFormKeySize(e.target.value)} className={inputClass}>
                                        {formKeyAlgorithm === 'RSA' ? (
                                            <>
                                                <option value="2048">2048 bits</option>
                                                <option value="3072">3072 bits</option>
                                                <option value="4096">4096 bits</option>
                                                <option value="7680">7680 bits (high compute)</option>
                                                <option value="8192">8192 bits (high compute)</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="256">P-256</option>
                                                <option value="384">P-384</option>
                                                <option value="521">P-521</option>
                                            </>
                                        )}
                                    </select>
                                    {formKeyAlgorithm === 'RSA' && (formKeySize === '7680' || formKeySize === '8192') && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                            ⚠ High-compute RSA — key generation may take 30+ seconds.
                                        </p>
                                    )}
                                </div>
                            )}
                            <div>
                                <label className={labelClass}>Validity (Years)</label>
                                <input type="text" inputMode="numeric" value={formValidityYears} onChange={(e) => setFormValidityYears(e.target.value.replace(/\D/g, ''))} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Label (optional)</label>
                                <input type="text" value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="my-ca-label" className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Public Base URL (optional)</label>
                                <input type="text" value={formPublicBaseUrl} onChange={(e) => setFormPublicBaseUrl(e.target.value)} placeholder="http://path2.ca.example.com" className={inputClass} />
                            </div>
                        </div>
                    </div>

                    {/* Name Constraints */}
                    <div className="border-t border-gray-300 dark:border-gray-700 pt-3">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Name Constraints</span>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            RFC 5280 general-name subtrees. One per line:
                            <code className="font-mono"> DNS:.example.com</code>,
                            <code className="font-mono"> IP:10.0.0.0/8</code>,
                            <code className="font-mono"> Email:@example.com</code>. Leave empty for no constraints.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                            <div>
                                <label className={labelClass}>Permitted subtrees (one per line)</label>
                                <textarea
                                    value={nameConstraintsPermittedText}
                                    onChange={(e) => setNameConstraintsPermittedText(e.target.value)}
                                    rows={4}
                                    placeholder={'DNS:.example.com\nIP:10.0.0.0/8'}
                                    className={`${inputClass} font-mono text-xs resize-y`}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Excluded subtrees (one per line)</label>
                                <textarea
                                    value={nameConstraintsExcludedText}
                                    onChange={(e) => setNameConstraintsExcludedText(e.target.value)}
                                    rows={4}
                                    placeholder={'DNS:.test.example.com'}
                                    className={`${inputClass} font-mono text-xs resize-y`}
                                />
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-yellow-800 dark:text-yellow-400">This action requires step-up MFA verification.</p>
                    <button
                        type="submit"
                        disabled={creating || !formSubjectCN.trim() || !formTenantId}
                        className="px-4 py-2 text-sm bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                        {creating ? 'Initiating...' : 'Initiate'}
                    </button>
                </form>
            )}

            {/* Ceremony List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">All Ceremonies ({ceremonies.length})</h3>
                </div>

                {/* Table Header */}
                <div className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 grid grid-cols-[1fr_120px_120px_100px_100px_120px] gap-2 items-center text-xs text-gray-600 font-semibold">
                    <span>Description</span>
                    <span>Operation</span>
                    <span>Status</span>
                    <span>Approvals</span>
                    <span>Initiator</span>
                    <span>Created</span>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && ceremonies.length === 0 && (
                        <div className="p-4 text-sm text-gray-600 text-center">No ceremonies found</div>
                    )}
                    {!loading && !error && ceremonies.map((ceremony) => {
                        const expanded = expandedKey === ceremony.id;
                        const detail = expanded ? expandedDetail : null;
                        const approvalLog = parseApprovalLog(detail?.approvalsJson || ceremony.approvalsJson);
                        const params = parseParameters(detail?.parametersJson);
                        const isPending = ceremony.status === 'Pending';
                        const isApproved = ceremony.status === 'Approved';
                        const canApprove = isPending && !isInitiator(ceremony);
                        const canCancel = isPending && isInitiator(ceremony);
                        const canExecute = isApproved && isApproverOrInitiator(ceremony);

                        return (
                            <div key={ceremony.id} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => handleExpand(ceremony.id)}
                                    className="w-full px-4 py-3 grid grid-cols-[1fr_120px_120px_100px_100px_120px] gap-2 items-center text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-sm text-gray-900 dark:text-white font-medium truncate">
                                        <span className="text-gray-600 text-xs mr-2">{expanded ? '\u25BC' : '\u25B6'}</span>
                                        {ceremony.description || ceremony.operationType}
                                    </span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400">{ceremony.operationType}</span>
                                    <StatusBadge
                                        status={ceremonyBadgeStatus(ceremony.status)}
                                        label={ceremony.status}
                                    />
                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                        {ceremony.currentApprovals ?? 0} / {ceremony.requiredApprovals ?? '-'}
                                    </span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                        {ceremony.initiatedByUsername || ceremony.initiatorName || ceremony.initiatedByName || '-'}
                                    </span>
                                    <span className="text-xs text-gray-600">{formatDate(ceremony.createdAt)}</span>
                                </button>

                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                                        {detailLoading && <div className="text-sm text-gray-600 text-center py-2">Loading details...</div>}

                                        {/* Ceremony Info */}
                                        <div>
                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Ceremony Details</span>
                                            <DetailField label="ID" value={ceremony.id} mono />
                                            <DetailField label="Operation Type" value={ceremony.operationType} />
                                            <DetailField label="Description" value={ceremony.description} />
                                            <DetailField label="Status" value={ceremony.status} />
                                            <DetailField label="Initiator" value={ceremony.initiatedByUsername || ceremony.initiatorName || ceremony.initiatedByName || '-'} />
                                            <DetailField label="Required Approvals" value={ceremony.requiredApprovals} />
                                            <DetailField label="Current Approvals" value={ceremony.currentApprovals ?? 0} />
                                            <DetailField label="Created" value={formatDate(ceremony.createdAt)} />
                                            <DetailField label="Expires" value={formatDate(ceremony.expiresAt)} />
                                            {ceremony.executedAt && <DetailField label="Executed" value={formatDate(ceremony.executedAt)} />}
                                        </div>

                                        {/* TenantPolicyChange variant: render before/after diff for only the fields whose proposed* is non-null */}
                                        {params && isTenantPolicyChange(ceremony) && (
                                            <div>
                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Policy Change</span>
                                                {(params.tenantId || params.TenantId) && (
                                                    <DetailField label="Tenant ID" value={params.tenantId || params.TenantId} mono />
                                                )}
                                                <div className="mt-2 overflow-x-auto">
                                                    <table className="w-full text-xs border border-gray-300 dark:border-gray-700 rounded">
                                                        <thead>
                                                            <tr className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                                                                <th className="text-left px-3 py-2 border-b border-gray-300 dark:border-gray-700">Field</th>
                                                                <th className="text-left px-3 py-2 border-b border-gray-300 dark:border-gray-700">Before &rarr; After</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {(() => {
                                                                const proposedReq = params.proposedRequireKeyCeremony ?? params.ProposedRequireKeyCeremony;
                                                                const currentReq = params.currentRequireKeyCeremony ?? params.CurrentRequireKeyCeremony;
                                                                if (proposedReq === null || proposedReq === undefined) return null;
                                                                return (
                                                                    <tr className="border-b border-gray-300 dark:border-gray-700">
                                                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">Ceremony Required</td>
                                                                        <td className="px-3 py-2">
                                                                            <StatusBadge
                                                                                status={currentReq ? 'active' : 'disabled'}
                                                                                label={currentReq ? 'true' : 'false'}
                                                                            />
                                                                            <span className="text-green-600 dark:text-green-400 font-bold mx-2">&rarr;</span>
                                                                            <StatusBadge
                                                                                status={proposedReq ? 'active' : 'disabled'}
                                                                                label={proposedReq ? 'true' : 'false'}
                                                                            />
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })()}
                                                            {(() => {
                                                                const proposedApprovals = params.proposedCeremonyRequiredApprovals ?? params.ProposedCeremonyRequiredApprovals;
                                                                const currentApprovals = params.currentCeremonyRequiredApprovals ?? params.CurrentCeremonyRequiredApprovals;
                                                                if (proposedApprovals === null || proposedApprovals === undefined) return null;
                                                                return (
                                                                    <tr>
                                                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">Required Approvals</td>
                                                                        <td className="px-3 py-2 font-mono">
                                                                            <span className="text-gray-700 dark:text-gray-300">{currentApprovals}</span>
                                                                            <span className="text-green-600 dark:text-green-400 font-bold mx-2">&rarr;</span>
                                                                            <span className="text-gray-700 dark:text-gray-300">{proposedApprovals}</span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })()}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* CA Creation Parameters (read-only) */}
                                        {params && !isTenantPolicyChange(ceremony) && (
                                            <>
                                                <div>
                                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Subject</span>
                                                    <DetailField label="Common Name (CN)" value={params.subjectCN || params.SubjectCN || '-'} />
                                                    {(params.subjectO || params.SubjectO) && <DetailField label="Organization (O)" value={params.subjectO || params.SubjectO} />}
                                                    {(params.subjectOU || params.SubjectOU) && <DetailField label="Organizational Unit (OU)" value={params.subjectOU || params.SubjectOU} />}
                                                    {(params.subjectL || params.SubjectL) && <DetailField label="Locality (L)" value={params.subjectL || params.SubjectL} />}
                                                    {(params.subjectST || params.SubjectST) && <DetailField label="State (ST)" value={params.subjectST || params.SubjectST} />}
                                                    {(params.subjectC || params.SubjectC) && <DetailField label="Country (C)" value={params.subjectC || params.SubjectC} />}
                                                </div>

                                                <div>
                                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Key Configuration</span>
                                                    <DetailField label="Algorithm" value={params.keyAlgorithm || params.KeyAlgorithm || '-'} />
                                                    <DetailField label="Key Size" value={params.keySize || params.KeySize || '-'} />
                                                    <DetailField label="Validity (Years)" value={params.validityYears || params.ValidityYears || '-'} />
                                                </div>

                                                <div>
                                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Scope</span>
                                                    <DetailField label="Tenant ID" value={params.tenantId || params.TenantId || '-'} mono />
                                                    {(params.parentCaId || params.ParentCaId) && <DetailField label="Parent CA ID" value={params.parentCaId || params.ParentCaId} mono />}
                                                    {(params.certProfileId || params.CertProfileId) && <DetailField label="Cert Profile ID" value={params.certProfileId || params.CertProfileId} mono />}
                                                    {(params.label || params.Label) && <DetailField label="Label" value={params.label || params.Label} />}
                                                    {(params.publicBaseUrl || params.PublicBaseUrl) && <DetailField label="Public Base URL" value={params.publicBaseUrl || params.PublicBaseUrl} mono />}
                                                </div>

                                                {((params.nameConstraintsPermitted || params.NameConstraintsPermitted)?.length > 0 ||
                                                  (params.nameConstraintsExcluded || params.NameConstraintsExcluded)?.length > 0) && (
                                                    <div>
                                                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Name Constraints</span>
                                                        {(params.nameConstraintsPermitted || params.NameConstraintsPermitted)?.length > 0 && (
                                                            <DetailField label="Permitted" value={(params.nameConstraintsPermitted || params.NameConstraintsPermitted).join('\n')} mono />
                                                        )}
                                                        {(params.nameConstraintsExcluded || params.NameConstraintsExcluded)?.length > 0 && (
                                                            <DetailField label="Excluded" value={(params.nameConstraintsExcluded || params.NameConstraintsExcluded).join('\n')} mono />
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Approval Log */}
                                        {approvalLog.length > 0 && (
                                            <div>
                                                <h4 className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-2">Approval Log</h4>
                                                <div className="space-y-1">
                                                    {approvalLog.map((entry: any, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-3 py-1 px-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                                                            <StatusBadge
                                                                status={entry.action === 'Approved' ? 'active' : entry.action === 'Rejected' ? 'revoked' : 'disabled'}
                                                                label={entry.action || entry.type}
                                                            />
                                                            <span className="text-gray-700 dark:text-gray-300">{entry.userName || entry.user || '-'}</span>
                                                            <span className="text-gray-600 ml-auto">{formatDate(entry.timestamp || entry.date)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        {(isPending || canExecute) && (
                                            <div className="flex gap-2">
                                                {canApprove && (
                                                    <button
                                                        onClick={() => handleApprove(ceremony)}
                                                        className="px-3 py-1 text-xs bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 transition-colors"
                                                    >
                                                        Approve (MFA)
                                                    </button>
                                                )}
                                                {isPending && (
                                                    <button
                                                        onClick={() => handleReject(ceremony)}
                                                        className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors"
                                                    >
                                                        Reject (MFA)
                                                    </button>
                                                )}
                                                {canCancel && (
                                                    <button
                                                        onClick={() => handleCancel(ceremony)}
                                                        className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                                    >
                                                        Cancel (MFA)
                                                    </button>
                                                )}
                                                {canExecute && (
                                                    <button
                                                        onClick={() => handleExecute(ceremony)}
                                                        disabled={executing === ceremony.id}
                                                        className="px-3 py-1 text-xs bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        {executing === ceremony.id ? 'Executing...' : 'Execute (MFA)'}
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
                        if (err.message !== 'Step-up MFA cancelled') {
                            showToast('error', err.message || 'Action failed');
                        }
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

export default KeyCeremonies;
