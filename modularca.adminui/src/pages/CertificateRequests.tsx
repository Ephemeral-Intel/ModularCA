import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../api/client';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function csrStatus(csr: any): 'pending' | 'active' | 'revoked' | 'held' | 'expired' {
    // A CSR with an issued certificate is always "active" regardless of status string
    if (csr.issuedCertificateId) return 'active';
    const s = (csr.status || '').toLowerCase();
    if (s === 'issued' || s === 'completed') return 'active';
    if (s === 'rejected' || s === 'failed' || s === 'cancelled') return 'revoked';
    if (s === 'approved') return 'active';
    if (s === 'partiallyapproved') return 'held';
    return 'pending';
}

function csrStatusLabel(csr: any): string {
    // A CSR with an issued certificate should always show as "Issued"
    if (csr.issuedCertificateId) return 'Issued';
    const s = (csr.status || '').toLowerCase();
    if (s === 'pendingapproval') return 'Pending Approval';
    if (s === 'partiallyapproved') {
        const count = csr.approvalCount ?? 0;
        const required = csr.requiredCount ?? '?';
        return `Partially Approved (${count}/${required})`;
    }
    return csr.status || 'Pending';
}

function decisionBadgeStatus(decision: string): 'active' | 'revoked' {
    return decision?.toLowerCase() === 'approved' ? 'active' : 'revoked';
}

function parseJsonSafe(val: string | null | undefined): string {
    if (!val) return '';
    try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed.join(', ');
        return String(parsed);
    } catch { return val; }
}

/** Returns true if the CSR is in a state that allows approval */
function canApprove(csr: any): boolean {
    const s = (csr.status || '').toLowerCase();
    return s === 'pending' || s === 'pendingapproval' || s === 'partiallyapproved';
}

/** Returns true if the CSR is fully approved and ready for issuance */
function canIssue(csr: any): boolean {
    return (csr.status || '').toLowerCase() === 'approved';
}

/** Returns true if the CSR can be cancelled (pending or approved, not yet issued) */
function canCancel(csr: any): boolean {
    const s = (csr.status || '').toLowerCase();
    return (s === 'approved' || s === 'pending' || s === 'pendingapproval') && !csr.issuedCertificateId;
}

interface ApprovalRecord {
    id: string;
    approverUsername: string;
    decision: string;
    comment: string;
    timestamp: string;
}

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Issued', 'Rejected', 'Cancelled'] as const;

const CertificateRequests: React.FC = () => {
    const [requests, setRequests] = useState<any[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>('Pending');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCsr, setSelectedCsr] = useState<any>(null);
    const [issueLoading, setIssueLoading] = useState(false);
    const [issueError, setIssueError] = useState<string | null>(null);
    const [issueSuccess, setIssueSuccess] = useState<string | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectLoading, setRejectLoading] = useState(false);
    const [rejectError, setRejectError] = useState<string | null>(null);

    // Approval workflow state
    const [approveComment, setApproveComment] = useState('');
    const [approveLoading, setApproveLoading] = useState(false);
    const [approveMessage, setApproveMessage] = useState<string | null>(null);
    const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
    const [approvalsLoading, setApprovalsLoading] = useState(false);

    // Cancel workflow state
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelLoading, setCancelLoading] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

    const loadRequests = () => {
        setLoading(true);
        setError(null);
        apiGet<any[]>('/api/v1/admin/requests')
            .then((data) => {
                setRequests(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.message || 'Failed to load requests');
                setLoading(false);
            });
    };

    useEffect(() => { loadRequests(); }, []);

    const loadApprovals = useCallback((csrId: string) => {
        setApprovalsLoading(true);
        apiGet<ApprovalRecord[]>(`/api/v1/admin/requests/${csrId}/approvals`)
            .then((data) => {
                setApprovals(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                setApprovals([]);
            })
            .finally(() => setApprovalsLoading(false));
    }, []);

    const openDetail = (csr: any) => {
        setSelectedCsr(csr);
        setIssueError(null);
        setApproveComment('');
        setApproveMessage(null);
        setApprovals([]);
        const csrId = csr.id || csr.requestId;
        // Load approvals for any CSR that may have them
        const s = (csr.status || '').toLowerCase();
        if (s === 'pendingapproval' || s === 'partiallyapproved' || s === 'approved' || s === 'rejected' || s === 'issued') {
            loadApprovals(csrId);
        }
    };

    const handleApprove = async (csr: any) => {
        const csrId = csr.id || csr.requestId;
        setApproveLoading(true);
        setIssueError(null);
        setApproveMessage(null);
        try {
            const result = await apiPost<{ message: string; status: string; approvalCount: number; requiredCount: number }>(
                `/api/v1/admin/requests/${csrId}/approve`,
                { comment: approveComment }
            );
            setApproveMessage(result.message || `Approval recorded (${result.approvalCount}/${result.requiredCount})`);
            setApproveComment('');
            // Refresh the CSR list and approvals
            loadRequests();
            loadApprovals(csrId);
            // Update the selected CSR in place with new status info
            setSelectedCsr((prev: any) => prev ? {
                ...prev,
                status: result.status,
                approvalCount: result.approvalCount,
                requiredCount: result.requiredCount,
            } : null);
        } catch (err: any) {
            setIssueError(err.message || 'Failed to record approval');
        } finally {
            setApproveLoading(false);
        }
    };

    const handleIssue = async (csr: any) => {
        setIssueLoading(true);
        setIssueError(null);
        setIssueSuccess(null);
        try {
            const result = await apiPost<any>('/api/v1/admin/certificates/issue', {
                csrId: csr.id || csr.requestId,
                notBefore: new Date().toISOString(),
                notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
                includeRoot: false,
            });
            const warnings = result?.warnings as string[] | undefined;
            if (warnings && warnings.length > 0) {
                setIssueSuccess(`Certificate issued for ${csr.subjectName || csr.subject}. Warning: ${warnings.join('; ')}`);
            } else {
                setIssueSuccess(`Certificate issued for ${csr.subjectName || csr.subject}`);
            }
            setSelectedCsr(null);
            loadRequests();
        } catch (err: any) {
            setIssueError(err.message || 'Failed to issue certificate');
        } finally {
            setIssueLoading(false);
        }
    };

    const handleReject = async () => {
        if (!selectedCsr || !rejectReason.trim()) return;
        setRejectLoading(true);
        setRejectError(null);
        try {
            const csrId = selectedCsr.id || selectedCsr.requestId;
            await apiPost(`/api/v1/admin/requests/${csrId}/reject`, { reason: rejectReason });
            setIssueSuccess(`Request rejected: ${selectedCsr.subjectName || selectedCsr.subject}`);
            setShowRejectModal(false);
            setSelectedCsr(null);
            setRejectReason('');
            loadRequests();
        } catch (err: any) {
            setRejectError(err.message || 'Failed to reject request');
        } finally {
            setRejectLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!selectedCsr || !cancelReason.trim()) return;
        setCancelLoading(true);
        setCancelError(null);
        try {
            const csrId = selectedCsr.id || selectedCsr.requestId;
            await apiPost(`/api/v1/admin/requests/${csrId}/cancel`, { reason: cancelReason });
            setIssueSuccess(`Request cancelled: ${selectedCsr.subjectName || selectedCsr.subject}`);
            setShowCancelModal(false);
            setSelectedCsr(null);
            setCancelReason('');
            loadRequests();
        } catch (err: any) {
            setCancelError(err.message || 'Failed to cancel request');
        } finally {
            setCancelLoading(false);
        }
    };

    const actionInProgress = issueLoading || approveLoading || cancelLoading;

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Certificate Requests</h1>
                <div className="flex gap-2 items-center">
                    <div className="flex rounded overflow-hidden border border-gray-400 dark:border-gray-600">
                        {STATUS_FILTERS.map((f) => (
                            <button key={f} onClick={() => setStatusFilter(f)}
                                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                    statusFilter === f
                                        ? 'bg-blue-600 text-gray-900 dark:text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                }`}>
                                {f}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={loadRequests}
                        className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {issueSuccess && (
                <div className="bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded px-4 py-3">
                    <p className="text-sm text-green-800 dark:text-green-300">{issueSuccess}</p>
                </div>
            )}

            {/* Request List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Certificate Requests
                        {!loading && <span className="text-gray-600 font-normal ml-2">({requests.filter((csr) => {
                            if (statusFilter === 'All') return true;
                            const effectiveStatus = csr.issuedCertificateId ? 'Issued' : (csr.status || 'Pending');
                            return effectiveStatus.toLowerCase() === statusFilter.toLowerCase();
                        }).length})</span>}
                    </h3>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && requests.length === 0 && (
                        <div className="p-4 text-sm text-gray-600 text-center">No pending certificate requests</div>
                    )}

                    {/* Table header */}
                    {!loading && !error && requests.length > 0 && (
                        <div className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 flex items-center gap-4 text-xs text-gray-600 font-semibold">
                            <span className="w-16">Status</span>
                            <span className="flex-1">Subject</span>
                            <span className="w-20">Algorithm</span>
                            <span className="w-16">Size</span>
                            <span className="w-36">Submitted</span>
                        </div>
                    )}

                    {!loading && !error && requests
                        .filter((csr) => {
                            if (statusFilter === 'All') return true;
                            const effectiveStatus = csr.issuedCertificateId ? 'Issued' : (csr.status || 'Pending');
                            return effectiveStatus.toLowerCase() === statusFilter.toLowerCase();
                        })
                        .map((csr) => {
                        const key = csr.id || csr.requestId;
                        return (
                            <div
                                key={key}
                                className="px-4 py-3 border-b border-gray-300 dark:border-gray-700 last:border-b-0 flex items-center gap-4 cursor-pointer hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors"
                                onClick={() => openDetail(csr)}
                            >
                                <span className="w-16">
                                    <StatusBadge status={csrStatus(csr)} label={csrStatusLabel(csr)} />
                                </span>
                                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{csr.subjectName || csr.subject}</span>
                                <span className="w-20 text-xs text-gray-600 dark:text-gray-400">{csr.keyAlgorithm}</span>
                                <span className="w-16 text-xs text-gray-600 dark:text-gray-400">{csr.keySize}</span>
                                <span className="w-36 text-xs text-gray-600">{formatDate(csr.submittedAt)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Detail Modal */}
            {selectedCsr && (
                <div
                    className="fixed inset-0 bg-black/25 dark:bg-black/60 flex items-center justify-center z-50"
                    onClick={() => !actionInProgress && setSelectedCsr(null)}
                >
                    <div
                        className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-300 dark:border-gray-700">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {selectedCsr.subjectName || selectedCsr.subject || 'Certificate Request'}
                            </h3>
                            <button
                                onClick={() => !actionInProgress && setSelectedCsr(null)}
                                className="text-gray-600 hover:text-gray-900 dark:hover:text-gray-900 dark:text-white text-lg transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300 space-y-1">
                            {(selectedCsr.status || '').toLowerCase() === 'rejected' && (
                                <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded px-3 py-2 mb-3">
                                    <span className="text-xs font-semibold text-red-800 dark:text-red-400">REJECTED</span>
                                    {selectedCsr.rejectionReason && (
                                        <span className="text-xs text-red-800 dark:text-red-300 ml-2">— {selectedCsr.rejectionReason}</span>
                                    )}
                                </div>
                            )}

                            {/* Approval Progress Section */}
                            {((selectedCsr.status || '').toLowerCase() === 'pendingapproval' ||
                              (selectedCsr.status || '').toLowerCase() === 'partiallyapproved') && (
                                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700/50 rounded px-3 py-3 mb-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-orange-800 dark:text-orange-300">Approval Progress</span>
                                        <span className="text-xs font-bold text-orange-800 dark:text-orange-200">
                                            {selectedCsr.approvalCount ?? 0} / {selectedCsr.requiredCount ?? '?'}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                        <div
                                            className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                                            style={{
                                                width: selectedCsr.requiredCount
                                                    ? `${Math.min(100, ((selectedCsr.approvalCount ?? 0) / selectedCsr.requiredCount) * 100)}%`
                                                    : '0%'
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Fully approved banner */}
                            {(selectedCsr.status || '').toLowerCase() === 'approved' && (
                                <div className="bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded px-3 py-2 mb-3">
                                    <span className="text-xs font-semibold text-green-800 dark:text-green-400">FULLY APPROVED</span>
                                    <span className="text-xs text-green-800 dark:text-green-300 ml-2">— Ready for certificate issuance</span>
                                </div>
                            )}

                            <DetailField label="Subject" value={selectedCsr.subjectName || selectedCsr.subject} />
                            <DetailField label="Status" value={csrStatusLabel(selectedCsr)} />
                            <DetailField label="Key Algorithm" value={selectedCsr.keyAlgorithm} />
                            <DetailField label="Key Size" value={selectedCsr.keySize} />
                            <DetailField label="Signature Algorithm" value={selectedCsr.signatureAlgorithm} />
                            <DetailField label="SANs" value={parseJsonSafe(selectedCsr.subjectAlternativeNames)} />
                            <DetailField label="Submitted" value={formatDate(selectedCsr.submittedAt)} />
                            {selectedCsr.certProfileId && <DetailField label="Cert Profile ID" value={selectedCsr.certProfileId} mono />}
                            {selectedCsr.signingProfileId && <DetailField label="Signing Profile ID" value={selectedCsr.signingProfileId} mono />}
                            <DetailField label="Request ID" value={selectedCsr.id || selectedCsr.requestId} mono />
                        </div>

                        {/* Approval History */}
                        {(approvals.length > 0 || approvalsLoading) && (
                            <div className="px-5 py-4 border-t border-gray-300 dark:border-gray-700">
                                <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">Approval History</h4>
                                {approvalsLoading && (
                                    <div className="text-xs text-gray-600 text-center py-2">Loading approvals...</div>
                                )}
                                {!approvalsLoading && approvals.length > 0 && (
                                    <div className="space-y-2">
                                        {approvals.map((a) => (
                                            <div key={a.id} className="bg-gray-50/50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 flex items-start gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{a.approverUsername}</span>
                                                        <StatusBadge
                                                            status={decisionBadgeStatus(a.decision)}
                                                            label={a.decision}
                                                        />
                                                    </div>
                                                    {a.comment && (
                                                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{a.comment}</div>
                                                    )}
                                                </div>
                                                <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">
                                                    {formatDate(a.timestamp)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="px-5 py-4 border-t border-gray-300 dark:border-gray-700 space-y-3">
                            {issueError && (
                                <div className="text-xs text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded px-3 py-2">
                                    {issueError}
                                </div>
                            )}
                            {approveMessage && (
                                <div className="text-xs text-green-800 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-800 rounded px-3 py-2">
                                    {approveMessage}
                                </div>
                            )}

                            {/* Approve comment input + button */}
                            {canApprove(selectedCsr) && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">Approval Comment (optional)</label>
                                    <input
                                        type="text"
                                        value={approveComment}
                                        onChange={(e) => setApproveComment(e.target.value)}
                                        placeholder="Add a comment..."
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-green-600"
                                    />
                                </div>
                            )}

                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={() => !actionInProgress && setSelectedCsr(null)}
                                    className="px-4 py-2 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                    disabled={actionInProgress}
                                >
                                    Close
                                </button>
                                {canApprove(selectedCsr) && (
                                    <>
                                        <button
                                            onClick={() => { setShowRejectModal(true); setRejectReason(''); setRejectError(null); }}
                                            disabled={actionInProgress}
                                            className="px-4 py-2 text-xs bg-red-700 text-gray-900 dark:text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
                                        >
                                            Reject
                                        </button>
                                        <button
                                            onClick={() => handleApprove(selectedCsr)}
                                            disabled={actionInProgress}
                                            className="px-4 py-2 text-xs bg-green-700 text-gray-900 dark:text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50"
                                        >
                                            {approveLoading ? 'Approving...' : 'Approve'}
                                        </button>
                                    </>
                                )}
                                {canCancel(selectedCsr) && (
                                    <button
                                        onClick={() => { setShowCancelModal(true); setCancelReason(''); setCancelError(null); }}
                                        disabled={actionInProgress}
                                        className="px-4 py-2 text-xs bg-orange-700 text-gray-900 dark:text-white rounded hover:bg-orange-600 transition-colors disabled:opacity-50"
                                    >
                                        Cancel Request
                                    </button>
                                )}
                                {canIssue(selectedCsr) && (
                                    <button
                                        onClick={() => handleIssue(selectedCsr)}
                                        disabled={actionInProgress}
                                        className="px-4 py-2 text-xs bg-blue-700 text-gray-900 dark:text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
                                    >
                                        {issueLoading ? 'Issuing...' : 'Issue Certificate'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Reason Modal */}
            {showRejectModal && selectedCsr && (
                <div
                    className="fixed inset-0 bg-black/30 dark:bg-black/70 flex items-center justify-center z-[60]"
                    onClick={() => !rejectLoading && setShowRejectModal(false)}
                >
                    <div
                        className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-gray-300 dark:border-gray-700">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Reject Certificate Request</h3>
                        </div>
                        <div className="px-5 py-4 space-y-4">
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                Rejecting request for <span className="text-gray-900 dark:text-white font-medium">{selectedCsr.subjectName || selectedCsr.subject}</span>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Reason *</label>
                                <select
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                >
                                    <option value="">Select a reason...</option>
                                    <option value="Policy violation">Policy violation</option>
                                    <option value="Invalid subject">Invalid subject</option>
                                    <option value="Weak key">Weak key</option>
                                    <option value="Duplicate request">Duplicate request</option>
                                    <option value="Unauthorized requestor">Unauthorized requestor</option>
                                    <option value="Incorrect profile">Incorrect profile</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            {rejectReason === 'Other' && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Custom reason</label>
                                    <textarea
                                        value=""
                                        onChange={(e) => setRejectReason(e.target.value)}
                                        rows={2}
                                        placeholder="Enter rejection reason..."
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            )}

                            {rejectError && (
                                <div className="text-xs text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded px-3 py-2">
                                    {rejectError}
                                </div>
                            )}
                        </div>
                        <div className="px-5 py-4 border-t border-gray-300 dark:border-gray-700 flex gap-2 justify-end">
                            <button
                                onClick={() => !rejectLoading && setShowRejectModal(false)}
                                className="px-4 py-2 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                disabled={rejectLoading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={rejectLoading || !rejectReason.trim()}
                                className="px-4 py-2 text-xs bg-red-700 text-gray-900 dark:text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
                            >
                                {rejectLoading ? 'Rejecting...' : 'Reject Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Reason Modal */}
            {showCancelModal && selectedCsr && (
                <div
                    className="fixed inset-0 bg-black/30 dark:bg-black/70 flex items-center justify-center z-[60]"
                    onClick={() => !cancelLoading && setShowCancelModal(false)}
                >
                    <div
                        className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-2xl w-full max-w-md mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-gray-300 dark:border-gray-700">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Cancel Certificate Request</h3>
                        </div>
                        <div className="px-5 py-4 space-y-4">
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                Cancelling request for <span className="text-gray-900 dark:text-white font-medium">{selectedCsr.subjectName || selectedCsr.subject}</span>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Reason *</label>
                                <select
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                >
                                    <option value="">Select a reason...</option>
                                    <option value="No longer needed">No longer needed</option>
                                    <option value="Superseded by new request">Superseded by new request</option>
                                    <option value="Incorrect parameters">Incorrect parameters</option>
                                    <option value="Requestor withdrew">Requestor withdrew</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            {cancelReason === 'Other' && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Custom reason</label>
                                    <textarea
                                        onChange={(e) => setCancelReason(e.target.value)}
                                        rows={2}
                                        placeholder="Enter cancellation reason..."
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            )}

                            {cancelError && (
                                <div className="text-xs text-red-800 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded px-3 py-2">
                                    {cancelError}
                                </div>
                            )}
                        </div>
                        <div className="px-5 py-4 border-t border-gray-300 dark:border-gray-700 flex gap-2 justify-end">
                            <button
                                onClick={() => !cancelLoading && setShowCancelModal(false)}
                                className="px-4 py-2 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                disabled={cancelLoading}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={cancelLoading || !cancelReason.trim()}
                                className="px-4 py-2 text-xs bg-orange-700 text-gray-900 dark:text-white rounded hover:bg-orange-600 transition-colors disabled:opacity-50"
                            >
                                {cancelLoading ? 'Cancelling...' : 'Cancel Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CertificateRequests;
