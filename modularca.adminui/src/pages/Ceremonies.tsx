import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
        case 'Pending': return 'expired';
        case 'Approved': return 'active';
        case 'Rejected': return 'revoked';
        case 'Executed': return 'pending';
        case 'Expired': return 'disabled';
        case 'Cancelled': return 'disabled';
        default: return 'disabled';
    }
}

// ── Ceremony family (type) ──────────────────────────────────────────────
type Family = 'CaCreation' | 'TenantPolicyChange' | 'ControlledUserChange';

function ceremonyFamily(c: any): Family {
    const ct = c?.ceremonyType;
    if (ct === 'TenantPolicyChange' || c?.operationType === 'TenantPolicyChange') return 'TenantPolicyChange';
    if (ct === 'ControlledUserChange' || c?.operationType === 'ControlledUserChange') return 'ControlledUserChange';
    return 'CaCreation';
}

const FAMILY_META: Record<Family, { label: string; cls: string }> = {
    CaCreation: { label: 'CA', cls: 'bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700' },
    TenantPolicyChange: { label: 'Tenant Policy', cls: 'bg-amber-50 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700' },
    ControlledUserChange: { label: 'Controlled User', cls: 'bg-purple-50 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-700' },
};

// ── Controlled-user change helpers ──────────────────────────────────────
const TIER_LABELS: Record<number, string> = { 1: 'Operator', 2: 'CA Admin', 3: 'System Admin', 4: 'System Super' };

function controlledChangeLabel(changeType: string): string {
    switch (changeType) {
        case 'GrantCapability': return 'Promote — grant capability';
        case 'AssignRole': return 'Promote — assign role';
        case 'AddGroupMember': return 'Promote — add to group';
        case 'RevokeCapability': return 'Demote — revoke capability';
        case 'UnassignRole': return 'Demote — unassign role';
        case 'RemoveGroupMember': return 'Demote — remove from group';
        case 'DeleteUser': return 'Delete user';
        default: return changeType || '-';
    }
}

const Ceremonies: React.FC = () => {
    const { requireStepUp } = useStepUp();
    const { showToast } = useToast();
    const [ceremonies, setCeremonies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [expandedDetail, setExpandedDetail] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [executing, setExecuting] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; title: string; message: string; confirmLabel: string } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Filters
    const [filterStatus, setFilterStatus] = useState<'mine' | 'pending' | 'all'>('mine');
    const [filterType, setFilterType] = useState<'all' | Family>('all');

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
        apiGet<any>('/api/v1/account')
            .then((me) => setCurrentUserId(me?.id || me?.userId || null))
            .catch(() => {});
    }, [refreshTrigger, fetchCeremonies]);

    // Auto-refresh every 30s while anything is pending.
    useEffect(() => {
        const hasPending = ceremonies.some((c) => c.status === 'Pending');
        if (!hasPending) return;
        const interval = setInterval(() => fetchCeremonies(), 30000);
        return () => clearInterval(interval);
    }, [ceremonies, fetchCeremonies]);

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

    const handleApprove = async (ceremony: any) => {
        try {
            await apiPostWithMfa(`/api/v1/admin/ceremonies/${ceremony.id}/approve`, {}, requireStepUp, 'approve-ceremony', ceremony.id);
            showToast('success', 'Ceremony approved.');
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') showToast('error', err.message || 'Failed to approve ceremony');
        }
    };

    const handleReject = (ceremony: any) => {
        setConfirmAction({
            title: 'Reject Ceremony',
            message: `Reject "${ceremony.description || ceremony.operationType}"? This is permanent.`,
            confirmLabel: 'Reject',
            action: async () => {
                await apiPostWithMfa(`/api/v1/admin/ceremonies/${ceremony.id}/reject`, {}, requireStepUp, 'reject-ceremony', ceremony.id);
                showToast('success', 'Ceremony rejected.');
                setRefreshTrigger((t) => t + 1);
            },
        });
    };

    const handleCancel = (ceremony: any) => {
        setConfirmAction({
            title: 'Cancel Ceremony',
            message: `Cancel "${ceremony.description || ceremony.operationType}"? This cannot be undone.`,
            confirmLabel: 'Cancel Ceremony',
            action: async () => {
                await apiDeleteWithMfa(`/api/v1/admin/ceremonies/${ceremony.id}`, requireStepUp, 'cancel-ceremony', ceremony.id);
                showToast('success', 'Ceremony cancelled.');
                setRefreshTrigger((t) => t + 1);
            },
        });
    };

    const handleExecute = async (ceremony: any) => {
        setExecuting(ceremony.id);
        try {
            const result = await apiPostWithMfa<any>(`/api/v1/admin/ceremonies/${ceremony.id}/execute`, {}, requireStepUp, 'execute-ceremony', ceremony.id);
            showToast('success', result?.message || 'Ceremony executed successfully.');
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            if (err.message !== 'Step-up MFA cancelled') showToast('error', err.message || 'Failed to execute ceremony');
        } finally {
            setExecuting(null);
        }
    };

    const parseApprovalLog = (json: string | null): any[] => {
        if (!json) return [];
        try { return JSON.parse(json); } catch { return []; }
    };
    const parseParameters = (json: string | null): any | null => {
        if (!json) return null;
        try { return JSON.parse(json); } catch { return null; }
    };

    const isInitiator = (c: any) =>
        !!currentUserId && (c.initiatedByUserId === currentUserId || c.initiatorId === currentUserId || c.initiatedBy === currentUserId);

    const isApproverOrInitiator = (c: any) => {
        if (isInitiator(c)) return true;
        if (!currentUserId) return false;
        const approvalsJson = expandedDetail?.approvalsJson || c.approvalsJson;
        return !!(approvalsJson && approvalsJson.includes(currentUserId));
    };

    const canExecute = (c: any) => c.status === 'Approved' && isApproverOrInitiator(c);
    const needsMyAction = (c: any) => !!c.canApprove || canExecute(c);

    // Apply filters
    const filtered = ceremonies.filter((c) => {
        if (filterType !== 'all' && ceremonyFamily(c) !== filterType) return false;
        if (filterStatus === 'pending') return c.status === 'Pending';
        if (filterStatus === 'mine') return needsMyAction(c);
        return true;
    });
    const mineCount = ceremonies.filter(needsMyAction).length;
    const pendingCount = ceremonies.filter((c) => c.status === 'Pending').length;

    const segBtn = (active: boolean) =>
        `px-3 py-1.5 text-xs font-medium rounded border transition-colors ${active
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'}`;

    const cols = 'grid grid-cols-[1fr_130px_120px_90px_110px_120px] gap-2 items-center';

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ceremonies</h1>

            {/* Where ceremonies come from */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-800 rounded-lg p-4 text-xs text-blue-800 dark:text-blue-300">
                Ceremonies are created automatically when a multi-party action is required — you don't start one here.
                They originate from <Link to="/authorities/manage" className="underline">CA Management</Link> (CA creation/revocation),
                Tenant settings (security-policy downgrades), and the <Link to="/users" className="underline">User &amp; Access</Link> pages
                (promoting, demoting, or deleting a controlled user as a non-super). Approve or reject them below.
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1">
                    <button className={segBtn(filterStatus === 'mine')} onClick={() => setFilterStatus('mine')}>Needs my action ({mineCount})</button>
                    <button className={segBtn(filterStatus === 'pending')} onClick={() => setFilterStatus('pending')}>Pending ({pendingCount})</button>
                    <button className={segBtn(filterStatus === 'all')} onClick={() => setFilterStatus('all')}>All</button>
                </div>
                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                >
                    <option value="all">All types</option>
                    <option value="CaCreation">CA</option>
                    <option value="TenantPolicyChange">Tenant Policy</option>
                    <option value="ControlledUserChange">Controlled User</option>
                </select>
            </div>

            {/* Ceremony list */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className={`px-4 py-2 border-b border-gray-300 dark:border-gray-700 ${cols} text-xs text-gray-600 font-semibold`}>
                    <span>Description</span>
                    <span>Type</span>
                    <span>Status</span>
                    <span>Approvals</span>
                    <span>Initiator</span>
                    <span>Created</span>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && filtered.length === 0 && (
                        <div className="p-6 text-sm text-gray-600 text-center">
                            {filterStatus === 'mine' ? 'Nothing needs your action right now.' : 'No ceremonies found.'}
                        </div>
                    )}
                    {!loading && !error && filtered.map((ceremony) => {
                        const expanded = expandedKey === ceremony.id;
                        const detail = expanded ? expandedDetail : null;
                        const approvalLog = parseApprovalLog(detail?.approvalsJson || ceremony.approvalsJson);
                        const params = parseParameters(detail?.parametersJson);
                        const family = ceremonyFamily(ceremony);
                        const isPending = ceremony.status === 'Pending';
                        const showApprove = !!ceremony.canApprove;
                        const showReject = isPending && (ceremony.canApprove || isInitiator(ceremony));
                        const showCancel = isPending && isInitiator(ceremony);
                        const showExecute = canExecute(ceremony);

                        return (
                            <div key={ceremony.id} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button onClick={() => handleExpand(ceremony.id)}
                                    className={`w-full px-4 py-3 ${cols} text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors`}>
                                    <span className="text-sm text-gray-900 dark:text-white font-medium truncate">
                                        <span className="text-gray-600 text-xs mr-2">{expanded ? '▼' : '▶'}</span>
                                        {ceremony.description || ceremony.operationType}
                                    </span>
                                    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border w-fit ${FAMILY_META[family].cls}`}>
                                        {FAMILY_META[family].label}
                                    </span>
                                    <StatusBadge status={ceremonyBadgeStatus(ceremony.status)} label={ceremony.status} />
                                    <span className="text-xs text-gray-600 dark:text-gray-400">{ceremony.currentApprovals ?? 0} / {ceremony.requiredApprovals ?? '-'}</span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{ceremony.initiatedByUsername || '-'}</span>
                                    <span className="text-xs text-gray-600">{formatDate(ceremony.createdAt)}</span>
                                </button>

                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                                        {detailLoading && <div className="text-sm text-gray-600 text-center py-2">Loading details...</div>}

                                        <div>
                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Ceremony Details</span>
                                            <DetailField label="ID" value={ceremony.id} mono />
                                            <DetailField label="Type" value={FAMILY_META[family].label} />
                                            <DetailField label="Operation" value={ceremony.operationType} />
                                            <DetailField label="Description" value={ceremony.description} />
                                            <DetailField label="Status" value={ceremony.status} />
                                            <DetailField label="Initiator" value={ceremony.initiatedByUsername || '-'} />
                                            <DetailField label="Approvals" value={`${ceremony.currentApprovals ?? 0} / ${ceremony.requiredApprovals ?? '-'}`} />
                                            <DetailField label="Created" value={formatDate(ceremony.createdAt)} />
                                            <DetailField label="Expires" value={formatDate(ceremony.expiresAt)} />
                                            {ceremony.executedAt && <DetailField label="Executed" value={formatDate(ceremony.executedAt)} />}
                                        </div>

                                        {/* Controlled-user change detail */}
                                        {params && family === 'ControlledUserChange' && (
                                            <div>
                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Controlled-User Change</span>
                                                <DetailField label="Action" value={controlledChangeLabel(params.changeType || params.ChangeType)} />
                                                <DetailField label="Target user" value={params.targetUsername || params.TargetUsername || params.targetUserId || params.TargetUserId || '-'} mono />
                                                <DetailField label="Affected tier" value={
                                                    `${TIER_LABELS[params.mintedTierLevel ?? params.MintedTierLevel] || '-'}`
                                                    + ((params.mintedTierCaId || params.MintedTierCaId) ? ` (CA ${params.mintedTierCaId || params.MintedTierCaId})` : ' (system)')
                                                } />
                                                {(params.capability || params.Capability) && <DetailField label="Capability" value={params.capability || params.Capability} mono />}
                                                {(params.roleId || params.RoleId) && <DetailField label="Role" value={params.roleId || params.RoleId} mono />}
                                                {(params.groupId || params.GroupId) && <DetailField label="Group" value={params.groupId || params.GroupId} mono />}
                                            </div>
                                        )}

                                        {/* Tenant policy change before/after */}
                                        {params && family === 'TenantPolicyChange' && (
                                            <div>
                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Policy Change</span>
                                                {(params.tenantId || params.TenantId) && <DetailField label="Tenant ID" value={params.tenantId || params.TenantId} mono />}
                                                {(() => {
                                                    const pReq = params.proposedRequireKeyCeremony ?? params.ProposedRequireKeyCeremony;
                                                    const cReq = params.currentRequireKeyCeremony ?? params.CurrentRequireKeyCeremony;
                                                    if (pReq === null || pReq === undefined) return null;
                                                    return <DetailField label="Ceremony Required" value={`${cReq} → ${pReq}`} />;
                                                })()}
                                                {(() => {
                                                    const pA = params.proposedCeremonyRequiredApprovals ?? params.ProposedCeremonyRequiredApprovals;
                                                    const cA = params.currentCeremonyRequiredApprovals ?? params.CurrentCeremonyRequiredApprovals;
                                                    if (pA === null || pA === undefined) return null;
                                                    return <DetailField label="Required Approvals" value={`${cA} → ${pA}`} />;
                                                })()}
                                            </div>
                                        )}

                                        {/* CA creation params */}
                                        {params && family === 'CaCreation' && (
                                            <div>
                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">CA Parameters</span>
                                                <DetailField label="Common Name" value={params.subjectCN || params.SubjectCN || '-'} />
                                                <DetailField label="Algorithm" value={params.keyAlgorithm || params.KeyAlgorithm || '-'} />
                                                <DetailField label="Key Size" value={params.keySize || params.KeySize || '-'} />
                                                <DetailField label="Validity (Years)" value={params.validityYears || params.ValidityYears || '-'} />
                                                <DetailField label="Tenant ID" value={params.tenantId || params.TenantId || '-'} mono />
                                                {(params.parentCaId || params.ParentCaId) && <DetailField label="Parent CA ID" value={params.parentCaId || params.ParentCaId} mono />}
                                                {(params.label || params.Label) && <DetailField label="Label" value={params.label || params.Label} />}
                                            </div>
                                        )}

                                        {/* Approval log */}
                                        {approvalLog.length > 0 && (
                                            <div>
                                                <h4 className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-2">Approval Log</h4>
                                                <div className="space-y-1">
                                                    {approvalLog.map((entry: any, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-3 py-1 px-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                                                            <StatusBadge
                                                                status={entry.action === 'Approved' ? 'active' : entry.action === 'Rejected' ? 'revoked' : 'disabled'}
                                                                label={entry.action || entry.type} />
                                                            <span className="text-gray-700 dark:text-gray-300">{entry.userName || entry.user || '-'}</span>
                                                            <span className="text-gray-600 ml-auto">{formatDate(entry.timestamp || entry.date)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        {(showApprove || showReject || showCancel || showExecute) && (
                                            <div className="flex gap-2">
                                                {showApprove && (
                                                    <button onClick={() => handleApprove(ceremony)}
                                                        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                                                        Approve (MFA)
                                                    </button>
                                                )}
                                                {showReject && (
                                                    <button onClick={() => handleReject(ceremony)}
                                                        className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors">
                                                        Reject (MFA)
                                                    </button>
                                                )}
                                                {showCancel && (
                                                    <button onClick={() => handleCancel(ceremony)}
                                                        className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                                                        Cancel (MFA)
                                                    </button>
                                                )}
                                                {showExecute && (
                                                    <button onClick={() => handleExecute(ceremony)} disabled={executing === ceremony.id}
                                                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
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
                        if (err.message !== 'Step-up MFA cancelled') showToast('error', err.message || 'Action failed');
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

export default Ceremonies;
