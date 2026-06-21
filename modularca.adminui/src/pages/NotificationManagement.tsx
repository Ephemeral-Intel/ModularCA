import React, { useEffect, useState } from 'react';
import { apiGet, apiPut, apiPost } from '../api/client';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const labelClass = 'block text-xs text-gray-600 dark:text-gray-400 mb-1';

const validateEmails = (value: string): string | null => {
    if (!value.trim()) return null;
    const emails = value.split(',').map(e => e.trim()).filter(Boolean);
    const invalid = emails.filter(e => !EMAIL_REGEX.test(e));
    if (invalid.length > 0) {
        return `Invalid email${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`;
    }
    return null;
};

interface AlertConfig {
    enabled: boolean;
    minimumSeverity: string;
    cooldownMinutes: number;
}

const NotificationManagement: React.FC = () => {
    const [prefs, setPrefs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedType, setExpandedType] = useState<string | null>(null);
    const [testStatus, setTestStatus] = useState<string | null>(null);
    const [editRecipients, setEditRecipients] = useState<Record<string, string>>({});
    const [editDaysBeforeExpiry, setEditDaysBeforeExpiry] = useState<Record<string, number | undefined>>({});
    const [emailErrors, setEmailErrors] = useState<Record<string, string | null>>({});

    // Alert configuration state
    const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);
    const [alertConfigLoading, setAlertConfigLoading] = useState(true);
    const [emailConfig, setEmailConfig] = useState<any | null>(null);

    const loadPrefs = async () => {
        setLoading(true);
        try {
            const data = await apiGet<any[]>('/api/v1/admin/notifications');
            setPrefs(data);
        } catch { }
        setLoading(false);
    };

    const loadConfig = async () => {
        setAlertConfigLoading(true);
        try {
            const config = await apiGet<any>('/api/v1/admin/config');
            // The config exposes Alert under various possible keys
            if (config.Alert) {
                setAlertConfig({
                    enabled: config.Alert.Enabled ?? config.Alert.enabled ?? true,
                    minimumSeverity: config.Alert.MinimumSeverity ?? config.Alert.minimumSeverity ?? 'Warning',
                    cooldownMinutes: config.Alert.CooldownMinutes ?? config.Alert.cooldownMinutes ?? 5,
                });
            }
            if (config.Email) {
                setEmailConfig(config.Email);
            }
        } catch { }
        setAlertConfigLoading(false);
    };

    useEffect(() => {
        loadPrefs();
        loadConfig();
    }, []);

    const toggleEnabled = async (eventType: string, currentEnabled: boolean) => {
        try {
            await apiPut(`/api/v1/admin/notifications/${eventType}`, { enabled: !currentEnabled });
        } finally {
            loadPrefs();
        }
    };

    const handleRecipientsChange = (eventType: string, value: string) => {
        setEditRecipients({ ...editRecipients, [eventType]: value });
        setEmailErrors({ ...emailErrors, [eventType]: validateEmails(value) });
    };

    const saveRecipients = async (eventType: string) => {
        const error = validateEmails(editRecipients[eventType] ?? '');
        if (error) {
            setEmailErrors({ ...emailErrors, [eventType]: error });
            return;
        }
        try {
            await apiPut(`/api/v1/admin/notifications/${eventType}`, { recipients: editRecipients[eventType] });
        } finally {
            loadPrefs();
        }
    };

    const saveDaysBeforeExpiry = async (eventType: string) => {
        const days = editDaysBeforeExpiry[eventType];
        if (days === undefined || days < 1) return;
        try {
            await apiPut(`/api/v1/admin/notifications/${eventType}`, { daysBeforeExpiry: days });
        } finally {
            loadPrefs();
        }
    };

    const sendTestEmail = async () => {
        setTestStatus('Sending...');
        try {
            await apiPost('/api/v1/admin/notifications/test');
            setTestStatus('Test email sent successfully!');
        } catch (err: any) {
            setTestStatus(`Failed: ${err.message}`);
        }
        setTimeout(() => setTestStatus(null), 5000);
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Notifications</h1>
                <button onClick={sendTestEmail} className="px-4 py-2 bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 text-sm">
                    Send Test Email
                </button>
            </div>

            {testStatus && (
                <div className={`p-3 rounded text-sm border ${testStatus.includes('success') ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300' : testStatus === 'Sending...' ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300' : 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300'}`}>
                    {testStatus}
                </div>
            )}

            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notification Preferences</h3>
                    <p className="text-xs text-gray-600 mt-1">Configure which events send email notifications and to whom.</p>
                </div>

                {loading && <div className="p-4 text-gray-600 dark:text-gray-400 text-sm text-center">Loading...</div>}

                {prefs.map((pref: any) => (
                    <div key={pref.eventType} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                        <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-200/50 dark:bg-gray-700/50"
                            onClick={() => setExpandedType(expandedType === pref.eventType ? null : pref.eventType)}>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleEnabled(pref.eventType, pref.enabled); }}
                                    className={`w-10 h-5 rounded-full transition-colors relative ${pref.enabled ? 'bg-green-600' : 'bg-gray-600'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${pref.enabled ? 'left-5' : 'left-0.5'}`} />
                                </button>
                                <div>
                                    <span className="text-sm text-gray-900 dark:text-white font-medium">{pref.eventType}</span>
                                    {pref.description && <span className="text-xs text-gray-600 ml-2">{pref.description}</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {pref.daysBeforeExpiry && <span className="text-xs text-gray-600">{pref.daysBeforeExpiry}d warning</span>}
                                <StatusBadge status={pref.enabled ? 'enabled' : 'disabled'} />
                                <span className="text-gray-600 dark:text-gray-400 text-xs">{expandedType === pref.eventType ? '\u25B2' : '\u25BC'}</span>
                            </div>
                        </div>

                        {expandedType === pref.eventType && (
                            <div className="px-4 pb-4 bg-gray-100/50 dark:bg-gray-800/50 border-t border-gray-300 dark:border-gray-700 pt-3 space-y-3">
                                <DetailField label="Event Type" value={pref.eventType} />

                                {pref.description && (
                                    <div>
                                        <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Description</label>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700/40 rounded px-3 py-2 border border-gray-400 dark:border-gray-600">
                                            {pref.description}
                                        </p>
                                    </div>
                                )}

                                {pref.daysBeforeExpiry !== undefined && pref.daysBeforeExpiry !== null && (
                                    <div>
                                        <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Days Before Expiry</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={editDaysBeforeExpiry[pref.eventType] ?? pref.daysBeforeExpiry ?? ''}
                                                onChange={e => { const v = e.target.value.replace(/\D/g, ''); setEditDaysBeforeExpiry({
                                                    ...editDaysBeforeExpiry,
                                                    [pref.eventType]: v ? parseInt(v, 10) : undefined
                                                }); }}
                                                className="w-24 bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white rounded px-2 py-1 text-sm"
                                            />
                                            <span className="text-xs text-gray-600">days</span>
                                            <button
                                                onClick={() => saveDaysBeforeExpiry(pref.eventType)}
                                                className="px-3 py-1 bg-blue-600 text-gray-900 dark:text-white rounded text-xs hover:bg-blue-700">
                                                Save
                                            </button>
                                            <div className="flex gap-1 ml-2">
                                                {[90, 60, 30, 14, 7, 1].map(d => (
                                                    <button
                                                        key={d}
                                                        onClick={() => setEditDaysBeforeExpiry({
                                                            ...editDaysBeforeExpiry,
                                                            [pref.eventType]: d
                                                        })}
                                                        className={`px-2 py-0.5 rounded text-xs border ${
                                                            (editDaysBeforeExpiry[pref.eventType] ?? pref.daysBeforeExpiry) === d
                                                                ? 'bg-blue-600 border-blue-500 text-gray-900 dark:text-white'
                                                                : 'bg-gray-200 dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-500'
                                                        }`}>
                                                        {d}d
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <DetailField label="Current Recipients" value={pref.recipients || '(uses admin default)'} />

                                <div>
                                    <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">Override Recipients (comma-separated emails)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={editRecipients[pref.eventType] ?? pref.recipients ?? ''}
                                            onChange={e => handleRecipientsChange(pref.eventType, e.target.value)}
                                            placeholder="Leave empty to use admin defaults"
                                            className={`flex-1 bg-gray-200 dark:bg-gray-700 border text-gray-900 dark:text-white rounded px-2 py-1 text-sm ${
                                                emailErrors[pref.eventType]
                                                    ? 'border-red-500 focus:border-red-400'
                                                    : 'border-gray-400 dark:border-gray-600 focus:border-gray-500'
                                            }`} />
                                        <button onClick={() => saveRecipients(pref.eventType)}
                                            className="px-3 py-1 bg-blue-600 text-gray-900 dark:text-white rounded text-xs hover:bg-blue-700">
                                            Save
                                        </button>
                                    </div>
                                    {emailErrors[pref.eventType] && (
                                        <p className="text-xs text-red-800 dark:text-red-400 mt-1">{emailErrors[pref.eventType]}</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Alert Configuration Section */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Security Alert Configuration</h3>
                    <p className="text-xs text-gray-600 mt-1">Real-time security alerts for high-risk operations. Configured in system config.</p>
                </div>

                {alertConfigLoading && <div className="p-4 text-gray-600 dark:text-gray-400 text-sm text-center">Loading...</div>}

                {!alertConfigLoading && alertConfig && (
                    <div className="p-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className={labelClass}>Alerting Enabled</label>
                                <div className="flex items-center gap-2">
                                    <StatusBadge status={alertConfig.enabled ? 'enabled' : 'disabled'} />
                                    <span className="text-sm text-gray-900 dark:text-white">{alertConfig.enabled ? 'Active' : 'Disabled'}</span>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Minimum Severity</label>
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 text-xs rounded border ${
                                        alertConfig.minimumSeverity === 'Critical'
                                            ? 'bg-red-50 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700'
                                            : alertConfig.minimumSeverity === 'Warning'
                                                ? 'bg-yellow-50 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700'
                                                : 'bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                    }`}>
                                        {alertConfig.minimumSeverity}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Cooldown Period</label>
                                <span className="text-sm text-gray-900 dark:text-white">{alertConfig.cooldownMinutes} minutes</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">
                            Alert settings are managed through the system configuration (Settings page). Alerts are dispatched via the email notification pipeline.
                        </p>
                    </div>
                )}

                {!alertConfigLoading && !alertConfig && (
                    <div className="p-4 text-sm text-gray-600 text-center">
                        Alert configuration not available. Ensure the system config endpoint is accessible.
                    </div>
                )}
            </div>

            {/* Email Configuration Summary */}
            {emailConfig && (
                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Email Configuration</h3>
                        <p className="text-xs text-gray-600 mt-1">SMTP configuration used for sending notification emails.</p>
                    </div>
                    <div className="p-4 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className={labelClass}>Email Sending</label>
                                <StatusBadge status={emailConfig.Enabled ?? emailConfig.enabled ? 'enabled' : 'disabled'} />
                            </div>
                            <div>
                                <label className={labelClass}>SMTP Host</label>
                                <span className="text-sm text-gray-900 dark:text-white">{emailConfig.SmtpHost ?? emailConfig.smtpHost ?? '-'}</span>
                            </div>
                            <div>
                                <label className={labelClass}>SMTP Port</label>
                                <span className="text-sm text-gray-900 dark:text-white">{emailConfig.SmtpPort ?? emailConfig.smtpPort ?? '-'}</span>
                            </div>
                            <div>
                                <label className={labelClass}>TLS</label>
                                <StatusBadge status={(emailConfig.UseTls ?? emailConfig.useTls) ? 'enabled' : 'disabled'} />
                            </div>
                            <div>
                                <label className={labelClass}>From Address</label>
                                <span className="text-sm text-gray-900 dark:text-white">{emailConfig.FromAddress ?? emailConfig.fromAddress ?? '-'}</span>
                            </div>
                            <div>
                                <label className={labelClass}>Admin Recipients</label>
                                <span className="text-sm text-gray-900 dark:text-white">{emailConfig.AdminRecipients ?? emailConfig.adminRecipients ?? '-'}</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">
                            Email settings are managed through the system configuration (Settings page).
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationManagement;
