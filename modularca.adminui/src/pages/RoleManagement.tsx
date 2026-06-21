import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import { useToast } from '../context/ToastContext';
import StatusBadge from '../components/cards/StatusBadge';
import ConfirmModal from '../components/ConfirmModal';

const ALL_CAPABILITIES = [
    'cert.request', 'cert.view', 'cert.revoke', 'cert.reissue', 'cert.approve',
    'profile.view', 'profile.use', 'profile.manage', 'profile.assign',
    'token.create', 'token.manage',
    'ca.view', 'ca.manage',
    'group.view', 'group.manage', 'user.manage',
    'audit.view', 'backup.manage', 'system.manage',
];

/// <summary>
/// Returns the display category for a capability string.
/// </summary>
function capabilityCategory(cap: string): string {
    if (cap.startsWith('cert.')) return 'Certificate';
    if (cap.startsWith('profile.')) return 'Profile';
    if (cap.startsWith('token.')) return 'Token';
    if (cap.startsWith('ca.')) return 'CA';
    return 'Admin';
}

/// <summary>
/// Returns a StatusBadge-compatible status string for a capability category.
/// </summary>
function categoryStatus(category: string): 'active' | 'pending' | 'held' | 'revoked' | 'disabled' {
    switch (category) {
        case 'Certificate': return 'active';
        case 'Profile': return 'pending';
        case 'Token': return 'held';
        case 'CA': return 'revoked';
        case 'Admin': return 'disabled';
        default: return 'disabled';
    }
}

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface RoleSummary {
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
    tenantId: string | null;
    capabilityCount: number;
    createdAt: string;
}

interface RoleCapability {
    id: string;
    capability: string;
    resourceType: string | null;
    resourceId: string | null;
}

interface RoleDetail {
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
    tenantId: string | null;
    createdAt: string;
    capabilities: RoleCapability[];
}

/// <summary>
/// Role management page with list view, expandable capability details, and CRUD operations.
/// </summary>
const RoleManagement: React.FC = () => {
    const { showToast } = useToast();
    const [roles, setRoles] = useState<RoleSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Role detail cache
    const [roleDetails, setRoleDetails] = useState<Record<string, RoleDetail>>({});

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ name: '', description: '' });
    const [creating, setCreating] = useState(false);

    // Edit state
    const [editingRole, setEditingRole] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [saving, setSaving] = useState(false);

    // Add capability state
    const [addingCapRole, setAddingCapRole] = useState<string | null>(null);
    const [newCapability, setNewCapability] = useState('');
    const [newResourceType, setNewResourceType] = useState('');
    const [newResourceId, setNewResourceId] = useState('');

    // Confirm modal state
    const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; title: string; message: string } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        apiGet<any>('/api/v1/admin/roles')
            .then((data) => {
                if (cancelled) return;
                setRoles(Array.isArray(data) ? data : (data.items || data.roles || []));
                setLoading(false);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load roles');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [refreshTrigger]);

    const fetchRoleDetail = async (roleId: string) => {
        try {
            const detail = await apiGet<RoleDetail>(`/api/v1/admin/roles/${roleId}`);
            setRoleDetails((prev) => ({ ...prev, [roleId]: detail }));
        } catch {
            // Silently fail -- user can see basic info
        }
    };

    const handleExpand = (roleId: string) => {
        if (expandedKey === roleId) {
            setExpandedKey(null);
            return;
        }
        setExpandedKey(roleId);
        if (!roleDetails[roleId]) {
            fetchRoleDetail(roleId);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            await apiPost('/api/v1/admin/roles', {
                name: createForm.name,
                description: createForm.description,
            });
            setShowCreate(false);
            setCreateForm({ name: '', description: '' });
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create role');
        } finally {
            setCreating(false);
        }
    };

    /// <summary>
    /// Prompts for confirmation before deleting a role via the ConfirmModal.
    /// </summary>
    const handleDelete = (role: RoleSummary) => {
        setConfirmAction({
            title: 'Delete Role',
            message: `Are you sure you want to delete "${role.name}"? This action cannot be undone.`,
            action: async () => {
                await apiDelete(`/api/v1/admin/roles/${role.id}`);
                setRefreshTrigger((t) => t + 1);
            },
        });
    };

    const handleSaveEdit = async (role: RoleSummary) => {
        setSaving(true);
        try {
            await apiPut(`/api/v1/admin/roles/${role.id}`, {
                name: editName,
                description: editDescription,
            });
            setEditingRole(null);
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to update role');
        } finally {
            setSaving(false);
        }
    };

    const startEditing = (role: RoleSummary) => {
        setEditingRole(role.id);
        setEditName(role.name);
        setEditDescription(role.description || '');
    };

    const handleAddCapability = async (roleId: string) => {
        if (!newCapability) return;
        try {
            await apiPost(`/api/v1/admin/roles/${roleId}/capabilities`, {
                capability: newCapability,
                resourceType: newResourceType || undefined,
                resourceId: newResourceId || undefined,
            });
            setNewCapability('');
            setNewResourceType('');
            setNewResourceId('');
            setAddingCapRole(null);
            fetchRoleDetail(roleId);
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to add capability');
        }
    };

    /// <summary>
    /// Prompts for confirmation before removing a capability from a role via the ConfirmModal.
    /// </summary>
    const handleDeleteCapability = (roleId: string, capId: string, capName: string) => {
        setConfirmAction({
            title: 'Remove Capability',
            message: `Are you sure you want to remove "${capName}" from this role?`,
            action: async () => {
                await apiDelete(`/api/v1/admin/roles/${roleId}/capabilities/${capId}`);
                fetchRoleDetail(roleId);
                setRefreshTrigger((t) => t + 1);
            },
        });
    };

    // Group capabilities by category for display
    const groupCapabilities = (capabilities: RoleCapability[]) => {
        const grouped: Record<string, RoleCapability[]> = {};
        for (const cap of capabilities) {
            const cat = capabilityCategory(cap.capability);
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(cap);
        }
        return grouped;
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Role Management</h1>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors"
                >
                    {showCreate ? 'Cancel' : 'Create Role'}
                </button>
            </div>

            {/* Create Role Form */}
            {showCreate && (
                <form onSubmit={handleCreate} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New Role</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Role name (e.g., certificate-manager)"
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

            {/* Role List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">All Roles ({roles.length})</h3>
                </div>

                {/* Table Header */}
                <div className="px-4 py-2 border-b border-gray-300 dark:border-gray-700 grid grid-cols-[auto_1fr_1fr_100px_100px_100px] gap-2 items-center text-xs text-gray-600 font-semibold">
                    <span className="w-4"></span>
                    <span>Name</span>
                    <span>Description</span>
                    <span>Built-in</span>
                    <span>Capabilities</span>
                    <span>Actions</span>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && roles.length === 0 && (
                        <div className="p-4 text-sm text-gray-600 text-center">No roles found</div>
                    )}
                    {!loading && !error && roles.map((role) => {
                        const expanded = expandedKey === role.id;
                        const detail = roleDetails[role.id];
                        const capabilities = detail?.capabilities || [];
                        const grouped = groupCapabilities(capabilities);

                        return (
                            <div key={role.id} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => handleExpand(role.id)}
                                    className="w-full px-4 py-3 grid grid-cols-[auto_1fr_1fr_100px_100px_100px] gap-2 items-center text-left hover:bg-gray-200/50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs w-4">{expanded ? '\u25BC' : '\u25B6'}</span>
                                    <span className="text-sm text-gray-900 dark:text-white font-medium truncate">{role.name}</span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{role.description || '-'}</span>
                                    <span>
                                        {role.isBuiltIn
                                            ? <StatusBadge status="pending" label="Built-in" />
                                            : <StatusBadge status="active" label="Custom" />
                                        }
                                    </span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400">{role.capabilityCount ?? 0}</span>
                                    <span onClick={(e) => e.stopPropagation()} className="flex gap-1">
                                        {!role.isBuiltIn && (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); startEditing(role); handleExpand(role.id); }}
                                                    className="px-2 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(role); }}
                                                    className="px-2 py-0.5 text-[10px] bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </span>
                                </button>

                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
                                        {/* Edit section */}
                                        {editingRole === role.id && !role.isBuiltIn ? (
                                            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-3 space-y-2">
                                                <h4 className="text-xs text-gray-600 dark:text-gray-400 font-semibold">Edit Role</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs text-gray-600 block mb-1">Name</label>
                                                        <input
                                                            type="text"
                                                            value={editName}
                                                            onChange={(e) => setEditName(e.target.value)}
                                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs text-gray-600 block mb-1">Description</label>
                                                        <input
                                                            type="text"
                                                            value={editDescription}
                                                            onChange={(e) => setEditDescription(e.target.value)}
                                                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleSaveEdit(role)}
                                                        disabled={saving}
                                                        className="px-3 py-1 text-xs bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        {saving ? 'Saving...' : 'Save'}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingRole(null)}
                                                        className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* Role details */}
                                        <div className="text-xs text-gray-600 space-y-1">
                                            <div><span className="font-semibold text-gray-600 dark:text-gray-400">ID:</span> <span className="font-mono">{role.id}</span></div>
                                            <div><span className="font-semibold text-gray-600 dark:text-gray-400">Created:</span> {formatDate(role.createdAt)}</div>
                                            {detail?.tenantId && (
                                                <div><span className="font-semibold text-gray-600 dark:text-gray-400">Tenant:</span> <span className="font-mono">{detail.tenantId}</span></div>
                                            )}
                                        </div>

                                        {/* Capabilities Section */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="text-xs text-gray-600 dark:text-gray-400 font-semibold">Capabilities ({capabilities.length})</h4>
                                                <button
                                                    onClick={() => {
                                                        setAddingCapRole(addingCapRole === role.id ? null : role.id);
                                                        setNewCapability('');
                                                        setNewResourceType('');
                                                        setNewResourceId('');
                                                    }}
                                                    className="px-2 py-1 text-xs bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors"
                                                >
                                                    {addingCapRole === role.id ? 'Cancel' : 'Add Capability'}
                                                </button>
                                            </div>

                                            {/* Add capability form */}
                                            {addingCapRole === role.id && (
                                                <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-3 mb-3 space-y-2">
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                        <div>
                                                            <label className="text-xs text-gray-600 block mb-1">Capability</label>
                                                            <select
                                                                value={newCapability}
                                                                onChange={(e) => setNewCapability(e.target.value)}
                                                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                            >
                                                                <option value="">Select capability...</option>
                                                                {ALL_CAPABILITIES.map((cap) => (
                                                                    <option key={cap} value={cap}>
                                                                        [{capabilityCategory(cap)}] {cap}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-gray-600 block mb-1">Resource Type (optional)</label>
                                                            <input
                                                                type="text"
                                                                value={newResourceType}
                                                                onChange={(e) => setNewResourceType(e.target.value)}
                                                                placeholder="e.g., ca, profile"
                                                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-gray-600 block mb-1">Resource ID (optional)</label>
                                                            <input
                                                                type="text"
                                                                value={newResourceId}
                                                                onChange={(e) => setNewResourceId(e.target.value)}
                                                                placeholder="e.g., specific resource ID"
                                                                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                                            />
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleAddCapability(role.id)}
                                                        disabled={!newCapability}
                                                        className="px-3 py-1 text-xs bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            )}

                                            {/* Capabilities grouped by category */}
                                            {capabilities.length === 0 && (
                                                <div className="text-xs text-gray-600">No capabilities assigned to this role</div>
                                            )}
                                            {Object.entries(grouped).map(([category, caps]) => (
                                                <div key={category} className="mb-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <StatusBadge status={categoryStatus(category)} label={category} />
                                                        <span className="text-[10px] text-gray-600">({caps.length})</span>
                                                    </div>
                                                    <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded overflow-hidden">
                                                        {/* Capability table header */}
                                                        <div className="px-3 py-1 border-b border-gray-300 dark:border-gray-700 grid grid-cols-[1fr_120px_120px_60px] gap-2 text-[10px] text-gray-600 font-semibold">
                                                            <span>Capability</span>
                                                            <span>Resource Type</span>
                                                            <span>Resource ID</span>
                                                            <span></span>
                                                        </div>
                                                        {caps.map((cap) => (
                                                            <div key={cap.id} className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 last:border-b-0 grid grid-cols-[1fr_120px_120px_60px] gap-2 items-center">
                                                                <span className="text-xs text-gray-900 dark:text-white font-mono">{cap.capability}</span>
                                                                <span className="text-xs text-gray-600 dark:text-gray-400">{cap.resourceType || '-'}</span>
                                                                <span className="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">{cap.resourceId || '-'}</span>
                                                                <button
                                                                    onClick={() => handleDeleteCapability(role.id, cap.id, cap.capability)}
                                                                    className="px-2 py-0.5 text-[10px] bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
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

export default RoleManagement;
