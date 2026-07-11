import { useEffect, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { adminUserService } from '../services/adminUserService';
import type { AdminUserRecord } from '../types';

const formatDate = (value: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatRole = (value: string) => value
  .split('_')
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [subscriptionFilter, setSubscriptionFilter] = useState('All');

  useEffect(() => {
    let isCancelled = false;

    const loadUsers = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const loadedUsers = await adminUserService.listUsers();
        if (!isCancelled) setUsers(loadedUsers);
      } catch (err) {
        if (!isCancelled) setErrorMessage(err instanceof Error ? err.message : 'Unable to load users.');
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    loadUsers();

    return () => {
      isCancelled = true;
    };
  }, []);

  const roleOptions = useMemo(() => ['All', ...Array.from(new Set(users.map(user => user.role).filter(Boolean))).sort()], [users]);
  const subscriptionOptions = useMemo(() => ['All', ...Array.from(new Set(users.map(user => user.subscriptionPlan).filter(Boolean))).sort()], [users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return users.filter(user => {
      const matchesSearch = !query || [user.name, user.email, user.role, user.company, user.subscriptionPlan]
        .some(value => value.toLowerCase().includes(query));
      const matchesRole = roleFilter === 'All' || user.role === roleFilter;
      const matchesSubscription = subscriptionFilter === 'All' || user.subscriptionPlan === subscriptionFilter;

      return matchesSearch && matchesRole && matchesSubscription;
    });
  }, [roleFilter, searchQuery, subscriptionFilter, users]);

  return (
    <section className="space-y-5 rounded-2xl border border-surface-container-high bg-white p-5 sm:p-7 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">Admin</p>
          <h3 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-primary tracking-tight">
            <Users className="h-6 w-6 text-secondary" />
            Users
          </h3>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Read-only platform user directory for Super Admin review.</p>
        </div>
        <span className="w-fit rounded-full bg-primary/10 px-4 py-2 font-sans text-xs font-extrabold text-primary">
          {filteredUsers.length} / {users.length} users
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_220px_220px]">
        <label className="relative block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search name, email, company, role, subscription..."
            className="w-full rounded-full border border-surface-container-high bg-surface-container-low py-3 pl-11 pr-4 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          />
        </label>
        <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
          {roleOptions.map(role => <option key={role} value={role}>{role === 'All' ? 'All Roles' : formatRole(role)}</option>)}
        </select>
        <select value={subscriptionFilter} onChange={event => setSubscriptionFilter(event.target.value)} className="rounded-full border border-surface-container-high bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
          {subscriptionOptions.map(plan => <option key={plan} value={plan}>{plan === 'All' ? 'All Subscriptions' : plan}</option>)}
        </select>
      </div>

      {errorMessage && <p className="rounded-2xl border border-error/30 bg-error/10 p-4 font-sans text-sm font-bold text-error">{errorMessage}</p>}

      <div className="overflow-x-auto rounded-2xl border border-surface-container-high">
        <table className="w-full min-w-[980px] text-left font-sans text-sm">
          <thead className="bg-surface-container-low text-primary">
            <tr>
              {['Name', 'Email', 'Role', 'Company', 'Created', 'Last Login', 'Subscription'].map(header => (
                <th key={header} className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.14em]">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length > 0 ? filteredUsers.map(user => (
              <tr key={user.id} className="border-t border-surface-container-high hover:bg-surface-container-low/50">
                <td className="px-4 py-3 font-extrabold text-primary">{user.name}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{user.email}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-primary/10 px-3 py-1 font-sans text-[10px] font-extrabold text-primary">{formatRole(user.role)}</span></td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{user.company}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3 font-bold text-on-surface-variant">{formatDate(user.lastLoginAt)}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-surface-container-low px-3 py-1 font-sans text-[10px] font-extrabold text-primary">{user.subscriptionPlan}</span></td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center font-sans text-sm font-bold text-on-surface-variant">
                  {isLoading ? 'Loading users...' : 'No users match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
