import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import { DetailPage, DetailSection } from '../components/DetailPage';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function caTypeBadge(ca: any): { status: 'active' | 'pending' | 'disabled'; label: string } {
    const t = (ca.type || ca.caType || '').toLowerCase();
    if (t.includes('root')) return { status: 'active', label: 'Root' };
    if (t.includes('intermediate')) return { status: 'pending', label: 'Intermediate' };
    return { status: 'disabled', label: 'Issuing' };
}

export const caKey = (ca: any): string => ca.id || ca.certificateId || ca.serialNumber || ca.name;

function flattenCas(cas: any[]): any[] {
    const result: any[] = [];
    for (const ca of cas) {
        result.push(ca);
        if (ca.children && ca.children.length > 0) result.push(...flattenCas(ca.children));
    }
    return result;
}

/// <summary>
/// Read-only detail page for a single certificate authority: CA info, certificate details, protocol
/// configurations, service URLs and OCSP responder. CAs aren't edited in place (creation lives on the
/// CA Management page), so this page is View-only.
/// </summary>
const CaDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [ca, setCa] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        apiGet<any>('/api/v1/admin/authorities/hierarchy')
            .then((data) => {
                if (cancelled) return;
                const items = Array.isArray(data) ? data : (data.items || data.authorities || []);
                setCa(flattenCas(items).find((c: any) => caKey(c) === id) || null);
                setLoading(false);
            })
            .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load CA'); setLoading(false); } });
        return () => { cancelled = true; };
    }, [id]);

    if (loading) return <div className="p-6 text-sm text-gray-600 dark:text-gray-400">Loading…</div>;
    if (error) return <div className="p-6 text-sm text-red-800 dark:text-red-400">{error}</div>;
    if (!ca) return (
        <div className="p-6 space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Certificate authority not found.</p>
            <button onClick={() => navigate('/authorities/manage')} className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded">Back to CA Management</button>
        </div>
    );

    const typeBadge = caTypeBadge(ca);
    const enabled = ca.enabled !== false;
    const cert = ca.certificate;

    let thumbprintDisplay = cert?.thumbprints;
    try { const tp = JSON.parse(cert?.thumbprints); thumbprintDisplay = Object.entries(tp).map(([k, v]) => `${k}: ${v}`).join('\n'); } catch { }
    let keyUsages = '';
    try { keyUsages = JSON.parse(cert?.keyUsagesJson || '[]').join(', '); } catch { }
    let ekuUsages = '';
    try { ekuUsages = JSON.parse(cert?.extendedKeyUsagesJson || '[]').join(', '); } catch { }

    return (
        <DetailPage
            breadcrumbs={[{ label: 'CA Management', to: '/authorities/manage' }, { label: ca.name || ca.subjectDN }]}
            title={ca.name || ca.subjectDN}
            status={<span className="flex items-center gap-2"><StatusBadge status={typeBadge.status} label={typeBadge.label} /><StatusBadge status={enabled ? 'enabled' : 'disabled'} label={enabled ? 'Enabled' : 'Disabled'} /></span>}
            subtitle={ca.label ? <span className="font-mono">{ca.label}</span> : undefined}
            backTo="/authorities/manage"
        >
            {() => (<>
                <DetailSection title="CA Information">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                        <DetailField label="Label" value={ca.label} mono />
                        {ca.tenantName && <DetailField label="Tenant" value={ca.tenantName} />}
                        <DetailField label="Default" value={ca.isDefault ? 'Yes' : 'No'} />
                        {ca.parentCaId && <DetailField label="Parent CA" value={ca.parentCaId} mono />}
                    </div>
                </DetailSection>

                <DetailSection title="Certificate Details">
                    {!cert ? (
                        <div className="text-xs text-gray-600 dark:text-gray-400">No certificate data available</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                            <DetailField label="Subject" value={cert.subjectDN} />
                            <DetailField label="Serial Number" value={cert.serialNumber} mono />
                            <DetailField label="Issuer" value={cert.issuer} />
                            <DetailField label="Not Before" value={formatDate(cert.notBefore)} />
                            <DetailField label="Not After" value={formatDate(cert.notAfter)} />
                            <DetailField label="Is CA" value={cert.isCA ? 'Yes' : 'No'} />
                            <DetailField label="Revoked" value={cert.revoked ? `Yes (${cert.revocationReason})` : 'No'} />
                            {keyUsages && <DetailField label="Key Usages" value={keyUsages} />}
                            {ekuUsages && <DetailField label="Extended Key Usages" value={ekuUsages} />}
                            <DetailField label="Thumbprints" value={thumbprintDisplay} mono />
                        </div>
                    )}
                </DetailSection>

                {ca.protocolConfigs && ca.protocolConfigs.length > 0 && (
                    <DetailSection title="Protocol Configurations">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[600px] text-xs">
                                <thead>
                                    <tr className="text-gray-600 border-b border-gray-300 dark:border-gray-700">
                                        <th className="text-left py-1 pr-4">Protocol</th>
                                        <th className="text-left py-1 pr-4">Enabled</th>
                                        <th className="text-left py-1">Profile</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ca.protocolConfigs.map((pc: any, idx: number) => (
                                        <tr key={idx} className="border-b border-gray-300 dark:border-gray-700/50 last:border-b-0">
                                            <td className="py-1 pr-4 text-gray-700 dark:text-gray-300">{pc.protocol || pc.name}</td>
                                            <td className="py-1 pr-4"><StatusBadge status={pc.enabled ? 'enabled' : 'disabled'} label={pc.enabled ? 'Yes' : 'No'} /></td>
                                            <td className="py-1 text-gray-600 dark:text-gray-400">{pc.signingProfileName || pc.signingProfile || pc.certProfile || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </DetailSection>
                )}

                {ca.serviceUrls && (
                    <DetailSection title="Service URLs">
                        <div className="flex items-center justify-end -mt-1 mb-2">
                            <Link to="/distribution?tab=serviceurls" className="text-xs text-blue-500 hover:text-blue-400 underline">Edit on Distribution</Link>
                        </div>
                        <DetailField label="Public Base URL" value={ca.serviceUrls.publicBaseUrl || '(not set)'} mono />
                        {ca.serviceUrls.publicBaseUrl && (
                            <>
                                <DetailField label="CDP" value={`${ca.serviceUrls.publicBaseUrl}/crl/${ca.label || ca.certificate?.serialNumber || ''}`} mono />
                                <DetailField label="OCSP" value={`${ca.serviceUrls.publicBaseUrl}/ocsp`} mono />
                                <DetailField label="CA Issuer" value={`${ca.serviceUrls.publicBaseUrl}/ca/${ca.label || ca.certificate?.serialNumber || ''}`} mono />
                            </>
                        )}
                    </DetailSection>
                )}

                {ca.ocspResponder && (
                    <DetailSection title="OCSP Responder">
                        <DetailField label="URL" value={ca.ocspResponder.url} mono />
                        <DetailField label="Status" value={ca.ocspResponder.enabled ? 'Enabled' : 'Disabled'} />
                        <DetailField label="Signing Cert" value={ca.ocspResponder.signingCertSubject} />
                    </DetailSection>
                )}

                <DetailSection title="Quick Links">
                    <Link to={`/distribution?tab=ldap&caId=${caKey(ca)}`}
                        className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors inline-block">
                        LDAP Publishers
                    </Link>
                </DetailSection>
            </>)}
        </DetailPage>
    );
};

export default CaDetail;
