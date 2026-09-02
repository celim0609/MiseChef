import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { CalendarClock, Copy, ExternalLink, Share2, Users, X } from 'lucide-react';
import { formatRegionCurrency } from '../../regions';
import { formatPickupDateLabel, getValidPickupDates } from './storeModel';
import { groupOrderService, storeService } from './services';
import type { HostGroupOrder, HostGroupOrderSummary, PublicStoreData } from './types';
import { getCanonicalGroupUrl, getGroupShareData } from './groupSharing';
import { getCustomerOrderStatus } from './customerOrderStatus';

const statusLabel = (status: HostGroupOrder['status']) => status[0].toUpperCase() + status.slice(1);

export default function HostProgramPage({ slug, currentUser }: { slug: string; currentUser: User | null }) {
  const [data, setData] = useState<PublicStoreData | null>(null);
  const [groups, setGroups] = useState<HostGroupOrder[]>([]);
  const [hostActive, setHostActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createdShareCode, setCreatedShareCode] = useState('');
  const [managedGroup, setManagedGroup] = useState<HostGroupOrder | null>(null);
  const [managedOrders, setManagedOrders] = useState<HostGroupOrderSummary[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [name, setName] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupSession, setPickupSession] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [closesAt, setClosesAt] = useState('');

  const refresh = async () => {
    const storeData = await storeService.getPublicStore(slug);
    setData(storeData);
    if (!storeData) return;
    setPickupDate(current => current || getValidPickupDates(storeData.store)[0] || '');
    setPickupSession(current => current || storeData.store.pickupSessions[0] || '');
    setPickupLocationId(current => current || storeData.store.pickupLocations[0]?.id || '');
    if (!currentUser) {
      setHostActive(false);
      setGroups([]);
      setManagedGroup(null);
      setManagedOrders([]);
      return;
    }
    const result = await groupOrderService.listMine(slug);
    setHostActive(result.hostActive);
    setGroups(result.groups);
  };

  useEffect(() => {
    setLoading(true);
    refresh().catch(error => setMessage(error instanceof Error ? error.message : 'Unable to load the Host Program.'))
      .finally(() => setLoading(false));
  // Auth is resolved by App and passed explicitly into this route.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, currentUser?.uid]);

  const validPickupDates = useMemo(() => data ? getValidPickupDates(data.store) : [], [data]);
  const summary = useMemo(() => groups.reduce((result, group) => ({
    active: result.active + (group.status === 'open' ? 1 : 0),
    sales: result.sales + group.eligibleSales,
    rewards: result.rewards + group.estimatedReward
  }), { active: 0, sales: 0, rewards: 0 }), [groups]);
  const hostIdentity = currentUser?.displayName?.trim()
    || currentUser?.email?.split('@')[0]?.trim()
    || 'MiseChef Host';

  const activate = async () => {
    setBusy(true);
    setMessage('');
    try {
      await groupOrderService.activateHost();
      setHostActive(true);
      setShowCreate(true);
      setMessage('Your Host profile is active. Start your first Group Order.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Host activation failed.');
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setCreatedShareCode('');
    try {
      const result = await groupOrderService.create(slug, {
        name,
        pickupDate,
        pickupSession,
        pickupLocationId,
        closesAt: new Date(closesAt).toISOString()
      });
      setName('');
      setClosesAt('');
      setCreatedShareCode(result.shareCode);
      setShowCreate(false);
      await refresh();
      setMessage('Group created. It is ready to share.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Group creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const share = async (group: Pick<HostGroupOrder, 'shareCode' | 'name' | 'storeName'>) => {
    const shareData = getGroupShareData(window.location.origin, group);
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareData.url);
      setMessage('Group link copied.');
    }
  };

  const copyShareCode = async (code: string) => {
    await navigator.clipboard.writeText(getCanonicalGroupUrl(window.location.origin, code));
    setMessage('Group link copied.');
  };

  const openManage = async (groupId: string) => {
    setManageLoading(true);
    setMessage('');
    try {
      const result = await groupOrderService.getMine(groupId);
      setManagedGroup(result.group);
      setManagedOrders(result.orders);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load this Group.');
    } finally {
      setManageLoading(false);
    }
  };

  const updateStatus = async (nextStatus: 'closed' | 'cancelled') => {
    if (!managedGroup) return;
    const action = nextStatus === 'closed' ? 'close' : 'cancel';
    if (!window.confirm(`Are you sure you want to ${action} ${managedGroup.name}? Existing orders and payments will not be changed.`)) return;
    setBusy(true);
    setMessage('');
    try {
      await groupOrderService.updateStatus(managedGroup.id, nextStatus);
      const detail = await groupOrderService.getMine(managedGroup.id);
      setManagedGroup(detail.group);
      setManagedOrders(detail.orders);
      await refresh();
      setMessage(`Group ${nextStatus}. Existing orders remain unchanged.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to ${action} this Group.`);
    } finally {
      setBusy(false);
    }
  };

  const cleanupGroup = async (action: 'delete' | 'archive') => {
    if (!managedGroup) return;
    const verb = action === 'delete' ? 'permanently delete' : 'archive';
    const consequence = action === 'delete'
      ? 'The old share link will stop working. This cannot be undone.'
      : 'It will leave My Hosted Groups, while customer orders, payments, fulfilment, sales and rewards remain unchanged.';
    if (!window.confirm(`Are you sure you want to ${verb} ${managedGroup.name}? ${consequence}`)) return;
    setBusy(true);
    setMessage('');
    try {
      await groupOrderService.cleanup(managedGroup.id, action);
      setManagedGroup(null);
      setManagedOrders([]);
      await refresh();
      setMessage(action === 'delete' ? 'Group permanently deleted.' : 'Group archived. Its order and reward history remains unchanged.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Unable to ${action} this Group.`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="h-80 animate-pulse rounded-3xl bg-surface-container-low" />;
  if (!data || !data.store.hostProgram.enabled) return <p className="rounded-3xl bg-surface-container-low p-8 text-center font-sans font-bold text-on-surface-variant">The Host Program is not available for this Store.</p>;

  if (!currentUser) {
    const returnTo = `/host/${encodeURIComponent(slug)}`;
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-surface-container-high bg-white p-8 text-center shadow-sm">
        <Users className="mx-auto h-10 w-10 text-secondary" />
        <p className="mt-4 font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-secondary">MiseChef Group Orders</p>
        <h1 className="mt-2 font-display text-4xl font-bold text-primary">Host group ordering for {data.store.name}</h1>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Create one pickup plan, share the link, and let every guest order and pay individually.</p>
        <a href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary">Login / Become a Host</a>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <section className="rounded-3xl bg-primary p-7 text-on-primary">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-on-primary/70">{data.store.name}</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Host Center</h1>
        <p className="mt-2 font-sans text-sm font-bold text-on-primary/80">Your group orders &amp; rewards</p>
        <p className="mt-1 font-sans text-xs font-bold text-on-primary/70">Signed in as {hostIdentity}</p>
      </section>

      {message && <p role="status" className="rounded-2xl bg-surface-container-low p-4 font-sans text-sm font-bold text-primary">{message}</p>}

      {!hostActive ? (
        <section className="rounded-3xl border border-surface-container-high bg-white p-7 shadow-sm">
          <h2 className="font-display text-2xl font-bold text-primary">Become a Host</h2>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">Activate Host access on your existing MiseChef account. No second account is created.</p>
          <button type="button" disabled={busy} onClick={activate} className="mt-5 rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">Become a Host</button>
        </section>
      ) : (
        <>
          <section aria-label="Host summary" className="grid gap-4 sm:grid-cols-3">
            {[
              ['Active Groups', String(summary.active)],
              ['Group Sales', formatRegionCurrency(summary.sales, data.store.currency)],
              ['Estimated Rewards', formatRegionCurrency(summary.rewards, data.store.currency)]
            ].map(([label, value]) => <article key={label} className="rounded-3xl border border-surface-container-high bg-white p-6 shadow-sm"><p className="font-sans text-xs font-extrabold uppercase tracking-wider text-outline">{label}</p><p className="mt-2 font-display text-3xl font-bold text-primary">{value}</p></article>)}
          </section>

          <button type="button" onClick={() => setShowCreate(current => !current)} className="rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary">{showCreate ? 'Close form' : '+ Start a Group Order'}</button>

          {showCreate && (
            <form onSubmit={create} className="rounded-3xl border border-surface-container-high bg-white p-7 shadow-sm">
              <h2 className="font-display text-2xl font-bold text-primary">Start a Group Order</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="font-sans text-xs font-extrabold text-primary">Group name</span><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="CC Office Breakfast" className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none" /></label>
                <label><span className="font-sans text-xs font-extrabold text-primary">Pickup date</span><select required value={pickupDate} onChange={event => setPickupDate(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary">{validPickupDates.map(date => <option key={date} value={date}>{formatPickupDateLabel(date, data.store.country)}</option>)}</select></label>
                <label><span className="font-sans text-xs font-extrabold text-primary">Pickup time</span><select required value={pickupSession} onChange={event => setPickupSession(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary">{data.store.pickupSessions.map(session => <option key={session}>{session}</option>)}</select></label>
                <label><span className="font-sans text-xs font-extrabold text-primary">Pickup location</span><select required value={pickupLocationId} onChange={event => setPickupLocationId(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary">{data.store.pickupLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
                <label><span className="font-sans text-xs font-extrabold text-primary">Closing time</span><input required type="datetime-local" value={closesAt} onChange={event => setClosesAt(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" /></label>
              </div>
              <button disabled={busy} className="mt-5 rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">Create &amp; Share</button>
            </form>
          )}

          {createdShareCode && <section className="rounded-3xl border border-secondary/30 bg-secondary/10 p-6"><h2 className="font-display text-2xl font-bold text-primary">Your Group is ready</h2><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => share({ shareCode: createdShareCode, name: 'MiseChef Group Order', storeName: data.store.name })} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-sans text-xs font-extrabold text-on-primary"><Share2 className="h-4 w-4" /> Share</button><button type="button" onClick={() => copyShareCode(createdShareCode)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-sans text-xs font-extrabold text-primary"><Copy className="h-4 w-4" /> Copy Link</button></div></section>}

          <section>
            <h2 className="font-display text-3xl font-bold text-primary">My Hosted Groups</h2>
            {groups.length === 0 ? <p className="mt-4 rounded-3xl bg-surface-container-low p-7 font-sans text-sm font-bold text-on-surface-variant">No Groups yet. Start your first Group Order.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">{groups.map(group => <article key={group.id} className="rounded-3xl border border-surface-container-high bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold text-primary">{group.name}</h3><p className="mt-1 font-sans text-xs font-extrabold uppercase tracking-wider text-secondary">{statusLabel(group.status)}</p></div><CalendarClock className="h-5 w-5 text-secondary" /></div><p className="mt-4 font-sans text-sm font-bold text-on-surface-variant">{formatPickupDateLabel(group.pickupDate, data.store.country)} · {group.pickupSession}<br />{group.pickupLocationName}</p><dl className="mt-5 grid grid-cols-3 gap-3"><div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Qualifying paid orders</dt><dd className="font-display text-2xl font-bold text-primary">{group.orderCount}</dd></div><div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Group Sales</dt><dd className="font-sans text-lg font-extrabold text-primary">{formatRegionCurrency(group.eligibleSales, data.store.currency)}</dd></div><div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Estimated Reward</dt><dd className="font-sans text-lg font-extrabold text-secondary">{formatRegionCurrency(group.estimatedReward, data.store.currency)}</dd></div></dl><div className="mt-5 grid grid-cols-3 gap-2"><a href={getCanonicalGroupUrl(window.location.origin, group.shareCode)} className="inline-flex items-center justify-center gap-2 rounded-full border border-primary px-4 py-3 font-sans text-xs font-extrabold text-primary"><ExternalLink className="h-4 w-4" /> View Store</a><button type="button" onClick={() => share(group)} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 font-sans text-xs font-extrabold text-on-primary"><Share2 className="h-4 w-4" /> Share</button><button type="button" disabled={manageLoading} onClick={() => openManage(group.id)} className="rounded-full bg-surface-container px-4 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50">Manage</button></div></article>)}</div>}
          </section>
        </>
      )}

      {managedGroup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="manage-group-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="font-sans text-xs font-extrabold uppercase tracking-wider text-secondary">Manage Group</p><h2 id="manage-group-title" className="mt-1 font-display text-3xl font-bold text-primary">{managedGroup.name}</h2></div>
              <button type="button" onClick={() => setManagedGroup(null)} aria-label="Close Manage Group" className="rounded-full border border-surface-container-high p-2 text-primary"><X className="h-5 w-5" /></button>
            </div>
            <dl className="mt-5 grid gap-3 rounded-2xl bg-surface-container-low p-4 font-sans text-sm font-bold text-on-surface-variant sm:grid-cols-2">
              <div><dt className="text-[10px] font-extrabold uppercase text-outline">Status</dt><dd>{statusLabel(managedGroup.status)}</dd></div>
              <div><dt className="text-[10px] font-extrabold uppercase text-outline">Orders close</dt><dd>{new Date(managedGroup.closesAt).toLocaleString()}</dd></div>
              <div><dt className="text-[10px] font-extrabold uppercase text-outline">Pickup</dt><dd>{formatPickupDateLabel(managedGroup.pickupDate, data.store.country)} · {managedGroup.pickupSession}</dd></div>
              <div><dt className="text-[10px] font-extrabold uppercase text-outline">Location</dt><dd>{managedGroup.pickupLocationName}</dd></div>
            </dl>
            {managedGroup.status === 'open' && <div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy} onClick={() => updateStatus('closed')} className="rounded-full border border-primary px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50">Close Group</button><button type="button" disabled={busy} onClick={() => updateStatus('cancelled')} className="rounded-full bg-error px-5 py-3 font-sans text-xs font-extrabold text-white disabled:opacity-50">Cancel Group</button></div>}
            <div className="mt-4">{managedGroup.lifetimeOrderCount === 0 ? <button type="button" disabled={busy} onClick={() => cleanupGroup('delete')} className="rounded-full border border-error px-5 py-3 font-sans text-xs font-extrabold text-error disabled:opacity-50">Delete Group</button> : managedGroup.status !== 'open' ? <button type="button" disabled={busy} onClick={() => cleanupGroup('archive')} className="rounded-full border border-primary px-5 py-3 font-sans text-xs font-extrabold text-primary disabled:opacity-50">Archive Group</button> : null}</div>
            <h3 className="mt-7 font-display text-2xl font-bold text-primary">Group orders</h3>
            <p className="mt-1 font-sans text-xs font-bold text-outline">View only. Store payment, refund and fulfilment controls remain with Store operators.</p>
            {managedOrders.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-surface-container-low p-5 font-sans text-sm font-bold text-on-surface-variant">No customer orders yet.</p>
            ) : (
              <div className="mt-4 space-y-3">{managedOrders.map(order => (
                <article key={order.id} className="rounded-2xl border border-surface-container-high p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-sans text-sm font-extrabold text-primary">{order.orderNumber}</h4><p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{order.customerName} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}</p></div><p className="font-sans text-sm font-extrabold text-primary">{formatRegionCurrency(order.total, order.currency)}</p></div>
                  <div className="mt-4 space-y-3">{order.items.map((item, itemIndex) => (
                    <div key={`${order.id}-${itemIndex}`} className="rounded-xl bg-surface-container-low p-3">
                      <p className="font-sans text-sm font-extrabold text-primary">{item.quantity} × {item.productName}</p>
                      {item.setSelections.map((selection, selectionIndex) => <p key={`${order.id}-set-${itemIndex}-${selectionIndex}`} className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{selection.groupName}: {selection.productName}</p>)}
                      {item.selectedOptions.map((option, optionIndex) => <p key={`${order.id}-option-${itemIndex}-${optionIndex}`} className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{option.groupName}: {option.optionName}</p>)}
                    </div>
                  ))}</div>
                  {order.remarks && <p className="mt-3 rounded-xl border border-surface-container-high px-3 py-2 font-sans text-xs font-bold text-on-surface-variant"><span className="font-extrabold text-primary">Remark:</span> {order.remarks}</p>}
                  <div className="mt-3"><span className="rounded-full bg-surface-container px-3 py-1 font-sans text-[10px] font-extrabold uppercase text-primary">{getCustomerOrderStatus(order)}</span></div>
                </article>
              ))}</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
