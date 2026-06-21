import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPostWithMfa, apiPut, apiPutWithMfa, apiDelete, apiDeleteWithMfa } from '../api/client';
import { useStepUp } from '../components/StepUpMfaContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/cards/StatusBadge';
import DetailField from '../components/cards/DetailField';
import ConfirmModal from '../components/ConfirmModal';

function formatDate(d: string | null) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Returns a StatusBadge-compatible status for a group's template name (color coding). */
function groupBadgeStatus(templateName: string | null): 'revoked' | 'held' | 'pending' | 'active' {
    switch (templateName?.toLowerCase() ?? '') {
        case 'administrator': return 'revoked';   // red
        case 'operator': return 'held';            // orange
        case 'auditor': return 'pending';          // blue
        case 'requester': return 'active';         // green
        default: return 'active';                  // green (custom)
    }
}

/// <summary>
/// Users page with group-based authorization management replacing the old role model.
/// The current user id is now sourced from useAuth
/// (which calls /api/v1/me) instead of decoding the JWT body client-side.
/// </summary>
const Users: React.FC = () => {
    const { showToast } = useToast();
    const { requireStepUp } = useStepUp();
    const { user: currentUser } = useAuth();
    const currentUserId = currentUser?.id ?? null;
    const [users, setUsers] = useState<any[]>([]);
    const [allGroups, setAllGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ username: '', email: '', password: '', firstName: '', lastName: '', groupIds: [] as string[] });
    const [creating, setCreating] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Group picker state per user
    const [addingGroupUser, setAddingGroupUser] = useState<string | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState('');

    // Confirm modal state
    const [confirmAction, setConfirmAction] = useState<{ action: () => Promise<void>; title: string; message: string; confirmLabel?: string } | null>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            apiGet<any>('/api/v1/admin/users'),
            apiGet<any>('/api/v1/admin/groups'),
        ])
            .then(([usersData, groupsData]) => {
                if (cancelled) return;
                setUsers(Array.isArray(usersData) ? usersData : (usersData.items || usersData.users || []));
                setAllGroups(Array.isArray(groupsData) ? groupsData : (groupsData.items || groupsData.groups || []));
                setLoading(false);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message || 'Failed to load users');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [refreshTrigger]);

    const filteredUsers = users.filter((u) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (u.username || '').toLowerCase().includes(s) || (u.email || '').toLowerCase().includes(s);
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            const newUser = await apiPostWithMfa<any>('/api/v1/admin/users', {
                username: createForm.username,
                email: createForm.email,
                password: createForm.password,
                firstName: createForm.firstName,
                lastName: createForm.lastName,
                groupIds: createForm.groupIds,
            }, requireStepUp, 'create-user');
            setShowCreate(false);
            setCreateForm({ username: '', email: '', password: '', firstName: '', lastName: '', groupIds: [] });
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to create user');
        } finally {
            setCreating(false);
        }
    };

    /// <summary>
    /// Prompts for confirmation before resetting a user's password via the ConfirmModal.
    /// </summary>
    const handleResetPassword = (user: any) => {
        setConfirmAction({
            title: 'Reset Password',
            message: `Are you sure you want to reset the password for "${user.username}"?`,
            confirmLabel: 'Reset Password',
            action: async () => {
                await apiPostWithMfa(`/api/v1/admin/users/${user.id}/reset-password`, {}, requireStepUp, 'reset-password', user.id);
                showToast('success', 'Password reset initiated');
            },
        });
    };

    const handleAddGroup = async (userId: string, groupId: string) => {
        try {
            await apiPostWithMfa(`/api/v1/admin/users/${userId}/groups/${groupId}`, {}, requireStepUp, 'add-group-member', userId);
            setAddingGroupUser(null);
            setSelectedGroupId('');
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to add user to group');
        }
    };

    const handleRemoveGroup = async (userId: string, groupId: string) => {
        try {
            await apiDeleteWithMfa(`/api/v1/admin/users/${userId}/groups/${groupId}`, requireStepUp, 'remove-group-member', userId);
            setRefreshTrigger((t) => t + 1);
        } catch (err: any) {
            showToast('error', err.message || 'Failed to remove user from group');
        }
    };

    const toggleCreateGroup = (groupId: string) => {
        setCreateForm((prev) => ({
            ...prev,
            groupIds: prev.groupIds.includes(groupId)
                ? prev.groupIds.filter((id) => id !== groupId)
                : [...prev.groupIds, groupId],
        }));
    };

    return (
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 text-sm bg-blue-600 text-gray-900 dark:text-white rounded hover:bg-blue-700 transition-colors"
                >
                    {showCreate ? 'Cancel' : 'Create User'}
                </button>
            </div>

            {/* Create User Form */}
            {showCreate && (
                <form onSubmit={handleCreate} className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New User</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="Username"
                            required
                            value={createForm.username}
                            onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="email"
                            placeholder="Email"
                            required
                            value={createForm.email}
                            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            required
                            value={createForm.password}
                            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="text"
                            placeholder="First Name"
                            required
                            value={createForm.firstName}
                            onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="text"
                            placeholder="Last Name"
                            required
                            value={createForm.lastName}
                            onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400 block mb-2">Groups (select one or more):</label>
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded">
                            {allGroups.map((g) => {
                                const selected = createForm.groupIds.includes(g.id);
                                return (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => toggleCreateGroup(g.id)}
                                        className={`px-2 py-1 text-xs rounded border transition-colors ${selected
                                            ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                                            : 'bg-gray-200/50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 border-gray-400 dark:border-gray-600 hover:bg-gray-200 dark:bg-gray-700 hover:text-gray-700 dark:text-gray-300'
                                            }`}
                                    >
                                        {selected ? '\u2713 ' : ''}{g.displayName || g.name}
                                    </button>
                                );
                            })}
                            {allGroups.length === 0 && (
                                <span className="text-xs text-gray-600">No groups available</span>
                            )}
                        </div>
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

            {/* Search */}
            <input
                type="text"
                placeholder="Search by username or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-md px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />

            {/* User List */}
            <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-300 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">All Users ({filteredUsers.length})</h3>
                </div>

                <div>
                    {loading && <div className="p-4 text-sm text-gray-600 dark:text-gray-400 text-center">Loading...</div>}
                    {error && <div className="p-4 text-sm text-red-800 dark:text-red-400 text-center">{error}</div>}
                    {!loading && !error && filteredUsers.length === 0 && (
                        <div className="p-4 text-sm text-gray-600 text-center">No users found</div>
                    )}
                    {!loading && !error && filteredUsers.map((user) => {
                        const key = user.id || user.username;
                        const expanded = expandedKey === key;
                        const isActive = user.isActive !== false && !user.isLocked;
                        const userGroups: any[] = user.groups || [];

                        return (
                            <div key={key} className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
                                <button
                                    onClick={() => setExpandedKey(expanded ? null : key)}
                                    className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-gray-200/50 dark:bg-gray-700/50 transition-colors"
                                >
                                    <span className="text-gray-600 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
                                    <StatusBadge status={user.isLocked ? 'locked' : (isActive ? 'active' : 'disabled')} />
                                    <span className="text-sm text-gray-900 dark:text-white font-medium">{user.username}</span>
                                    <span className="text-xs text-gray-600 dark:text-gray-400">{user.email}</span>
                                    <div className="flex gap-1 ml-2 flex-wrap">
                                        {userGroups.map((g: any) => (
                                            <span
                                                key={g.groupId}
                                                className={`inline-block px-2 py-0.5 text-xs rounded border ${
                                                    g.isSystemGroup
                                                        ? 'bg-transparent border-current'
                                                        : ''
                                                } ${(() => {
                                                    const s = groupBadgeStatus(g.templateName);
                                                    const colors: Record<string, string> = {
                                                        revoked: 'text-red-800 dark:text-red-300 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/50',
                                                        held: 'text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/50',
                                                        pending: 'text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/50',
                                                        active: 'text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/50',
                                                    };
                                                    if (g.isSystemGroup) {
                                                        // Outlined style for system groups
                                                        const outlineColors: Record<string, string> = {
                                                            revoked: 'text-red-800 dark:text-red-300 border-red-500 bg-transparent',
                                                            held: 'text-orange-800 dark:text-orange-300 border-orange-500 bg-transparent',
                                                            pending: 'text-blue-800 dark:text-blue-300 border-blue-500 bg-transparent',
                                                            active: 'text-green-800 dark:text-green-300 border-green-500 bg-transparent',
                                                        };
                                                        return outlineColors[s] || outlineColors.active;
                                                    }
                                                    return colors[s] || colors.active;
                                                })()}`}
                                            >
                                                {g.displayName || g.groupName}
                                            </span>
                                        ))}
                                    </div>
                                    <span className="ml-auto text-xs text-gray-600">
                                        Last login: {formatDate(user.lastLogin || user.lastLoginAt)}
                                    </span>
                                </button>
                                {expanded && (
                                    <div className="px-4 pb-4 bg-gray-50/50 dark:bg-gray-900/50">
                                        <DetailField label="Username" value={user.username} />
                                        <DetailField label="Email" value={user.email} />
                                        <DetailField label="Groups" value={userGroups.map((g: any) => g.displayName || g.groupName).join(', ') || 'None'} />
                                        <DetailField label="Active" value={isActive ? 'Yes' : 'No'} />
                                        <DetailField label="Locked" value={user.isLocked ? 'Yes' : 'No'} />
                                        <DetailField label="Created" value={formatDate(user.createdAt)} />
                                        <DetailField label="Last Login" value={formatDate(user.lastLogin || user.lastLoginAt)} />
                                        <DetailField label="Failed Logins" value={user.failedLoginCount} />

                                        <div className="mt-3 space-y-2">
                                            <div className="text-xs text-gray-600 dark:text-gray-400 font-semibold">Group Management</div>
                                            <div className="flex gap-2 flex-wrap">
                                                {userGroups.map((g: any) => (
                                                    <span
                                                        key={g.groupId}
                                                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border ${
                                                            g.isSystemGroup ? 'bg-transparent' : ''
                                                        } ${(() => {
                                                            const s = groupBadgeStatus(g.templateName);
                                                            const colors: Record<string, string> = {
                                                                revoked: 'text-red-800 dark:text-red-300 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/50',
                                                                held: 'text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/50',
                                                                pending: 'text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/50',
                                                                active: 'text-green-800 dark:text-green-300 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/50',
                                                            };
                                                            if (g.isSystemGroup) {
                                                                const outlineColors: Record<string, string> = {
                                                                    revoked: 'text-red-800 dark:text-red-300 border-red-500 bg-transparent',
                                                                    held: 'text-orange-800 dark:text-orange-300 border-orange-500 bg-transparent',
                                                                    pending: 'text-blue-800 dark:text-blue-300 border-blue-500 bg-transparent',
                                                                    active: 'text-green-800 dark:text-green-300 border-green-500 bg-transparent',
                                                                };
                                                                return outlineColors[s] || outlineColors.active;
                                                            }
                                                            return colors[s] || colors.active;
                                                        })()}`}
                                                    >
                                                        {g.displayName || g.groupName}
                                                        <button
                                                            onClick={() => handleRemoveGroup(user.id, g.groupId)}
                                                            className="ml-1 text-current opacity-60 hover:opacity-100"
                                                            title="Remove from group"
                                                        >
                                                            &times;
                                                        </button>
                                                    </span>
                                                ))}
                                                {userGroups.length === 0 && (
                                                    <span className="text-xs text-gray-600">No groups assigned</span>
                                                )}
                                            </div>

                                            {/* Add to Group */}
                                            {addingGroupUser === user.id ? (
                                                <div className="flex gap-2 items-center mt-2">
                                                    <select
                                                        value={selectedGroupId}
                                                        onChange={(e) => setSelectedGroupId(e.target.value)}
                                                        className="flex-1 max-w-xs px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                    >
                                                        <option value="">Select group...</option>
                                                        {allGroups
                                                            .filter((g) => !userGroups.some((ug: any) => ug.groupId === g.id))
                                                            .map((g) => (
                                                                <option key={g.id} value={g.id}>{g.displayName || g.name}</option>
                                                            ))}
                                                    </select>
                                                    <button
                                                        onClick={() => handleAddGroup(user.id, selectedGroupId)}
                                                        disabled={!selectedGroupId}
                                                        className="px-3 py-1 text-xs bg-green-600 text-gray-900 dark:text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        Add
                                                    </button>
                                                    <button
                                                        onClick={() => { setAddingGroupUser(null); setSelectedGroupId(''); }}
                                                        className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setAddingGroupUser(user.id)}
                                                    className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-900 transition-colors"
                                                >
                                                    + Add to Group
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex gap-2 mt-3 flex-wrap">
                                            <button
                                                onClick={() => handleResetPassword(user)}
                                                className="px-3 py-1 text-xs bg-yellow-50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700 rounded hover:bg-yellow-900 transition-colors"
                                            >
                                                Reset Password
                                            </button>
                                            {(() => {
                                                const isSuperGroup = userGroups.some((g: any) => (g.groupName || g.name) === 'system-super');
                                                // Check if other users have system-admin or system-super groups
                                                const otherSystemAdminCount = users.filter((u: any) =>
                                                    u.id !== user.id &&
                                                    u.isActive !== false &&
                                                    (u.groups || []).some((g: any) => {
                                                        const name = g.groupName || g.name || '';
                                                        return name === 'system-admin' || name === 'system-super';
                                                    })
                                                ).length;
                                                const isSelf = user.id === currentUserId;
                                                const canDisable = !isSelf && (!isSuperGroup || otherSystemAdminCount > 0);

                                                return user.isActive !== false ? (
                                                    <button
                                                        onClick={() => {
                                                            if (isSuperGroup && otherSystemAdminCount === 0) {
                                                                showToast('warning', 'Cannot disable the super admin account — no other system admins exist. Create another system admin first.');
                                                                return;
                                                            }
                                                            const superWarning = isSuperGroup
                                                                ? ` WARNING: This is a super admin account. Once disabled, it can ONLY be re-enabled via direct database access.`
                                                                : '';
                                                            setConfirmAction({
                                                                title: 'Disable Account',
                                                                message: `Disable user "${user.username}"? They will not be able to log in.${superWarning}`,
                                                                confirmLabel: 'Disable',
                                                                action: async () => {
                                                                    await apiPutWithMfa(`/api/v1/admin/users/${user.id}`, { isActive: false }, requireStepUp, 'update-user', user.id);
                                                                    setRefreshTrigger((t) => t + 1);
                                                                },
                                                            });
                                                        }}
                                                        disabled={!canDisable}
                                                        className="px-3 py-1 text-xs bg-red-50 dark:bg-red-900/50 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-700 rounded hover:bg-red-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                                        title={isSelf ? 'You cannot disable your own account' : !canDisable ? 'Cannot disable — no other system admins exist' : 'Disable this account'}
                                                    >
                                                        Disable Account
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            setConfirmAction({
                                                                title: 'Enable Account',
                                                                message: `Re-enable user "${user.username}"? They will be able to log in again.`,
                                                                confirmLabel: 'Enable',
                                                                action: async () => {
                                                                    await apiPutWithMfa(`/api/v1/admin/users/${user.id}`, { isActive: true }, requireStepUp, 'update-user', user.id);
                                                                    setRefreshTrigger((t) => t + 1);
                                                                },
                                                            });
                                                        }}
                                                        className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/50 text-green-800 dark:text-green-300 border border-green-300 dark:border-green-700 rounded hover:bg-green-900 transition-colors"
                                                    >
                                                        Enable Account
                                                    </button>
                                                );
                                            })()}
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
                confirmLabel={confirmAction?.confirmLabel || 'Confirm'}
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

export default Users;
