import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, Copy, Share2, Users } from 'lucide-react';
import { auth } from '../../firebase';
import { formatRegionCurrency } from '../../regions';
import { formatPickupDateLabel, getValidPickupDates } from './storeModel';
import { groupOrderService, storeService } from './services';
import type { HostGroupOrder, PublicStoreData } from './types';

const shareUrl = (code: string) => `${window.location.origin}/group/${encodeURIComponent(code)}`;

export default function HostProgramPage({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicStoreData | null>(null);
  const [groups, setGroups] = useState<HostGroupOrder[]>([]);
  const [hostActive, setHostActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupSession, setPickupSession] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const user = auth?.currentUser;

  const refresh = async () => {
    const storeData = await storeService.getPublicStore(slug);
    setData(storeData);
    if (!storeData) return;
    setPickupDate(current => current || getValidPickupDates(storeData.store)[0] || '');
    setPickupSession(current => current || storeData.store.pickupSessions[0] || '');
    setPickupLocationId(current => current || storeData.store.pickupLocations[0]?.id || '');
    if (user) {
      const result = await groupOrderService.listMine(slug);
      setHostActive(result.hostActive);
      setGroups(result.groups);
    }
  };

  useEffect(() => {
    refresh().catch(error => setMessage(error instanceof Error ? error.message : 'Unable to load the Host Program.'))
      .finally(() => setLoading(false));
  // The public slug and app-resolved auth state define this page load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user?.uid]);

  const validPickupDates = useMemo(() => data ? getValidPickupDates(data.store) : [], [data]);

  const activate = async () => {
    setBusy(true);
    setMessage('');
    try {
      await groupOrderService.activateHost();
      setHostActive(true);
      setMessage('Your Host profile is active.');
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
      await refresh();
      setMessage(`Group created. Share ${shareUrl(result.shareCode)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Group creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const share = async (group: HostGroupOrder) => {
    const url = shareUrl(group.shareCode);
    if (navigator.share) {
      await navigator.share({ title: group.name, text: `Join my MiseChef Group Order for ${group.storeName}.`, url });
    } else {
      await navigator.clipboard.writeText(url);
      setMessage('Group link copied.');
    }
  };

  if (loading) return <div className="h-80 animate-pulse rounded-3xl bg-surface-container-low" />;
  if (!data || !data.store.hostProgram.enabled) return <p className="rounded-3xl bg-surface-container-low p-8 text-center font-sans font-bold text-on-surface-variant">The Host Program is not available for this Store.</p>;

  if (!user) {
    const returnTo = `/host/${encodeURIComponent(slug)}`;
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-surface-container-high bg-white p-8 text-center shadow-sm">
        <Users className="mx-auto h-10 w-10 text-secondary" />
        <h1 className="mt-4 font-display text-4xl font-bold text-primary">Become a Host</h1>
        <p className="mt-3 font-sans text-sm font-bold text-on-surface-variant">Sign in or register with MiseChef to create and manage Group Orders for {data.store.name}. Guests you invite will not need an account.</p>
        <a href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary">Login or Register</a>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <section className="rounded-3xl bg-primary p-7 text-on-primary">
        <p className="font-sans text-xs font-extrabold uppercase tracking-[0.18em] text-on-primary/70">MiseChef Host Program</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Group Orders for {data.store.name}</h1>
        <p className="mt-3 max-w-2xl font-sans text-sm font-bold text-on-primary/80">Invite friends or colleagues. Everyone orders and pays individually, then collects together.</p>
      </section>

      {message && <p role="status" className="rounded-2xl bg-surface-container-low p-4 font-sans text-sm font-bold text-primary">{message}</p>}

      {!hostActive ? (
        <section className="rounded-3xl border border-surface-container-high bg-white p-7 shadow-sm">
          <h2 className="font-display text-2xl font-bold text-primary">Activate your Host profile</h2>
          <p className="mt-2 font-sans text-sm font-bold text-on-surface-variant">This uses your existing MiseChef account—no second account is created.</p>
          <button type="button" disabled={busy} onClick={activate} className="mt-5 rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">Become a Host</button>
        </section>
      ) : (
        <form onSubmit={create} className="rounded-3xl border border-surface-container-high bg-white p-7 shadow-sm">
          <h2 className="font-display text-2xl font-bold text-primary">Create Group Order</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="font-sans text-xs font-extrabold text-primary">Group name</span><input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="CC Office Breakfast" className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary outline-none" /></label>
            <label><span className="font-sans text-xs font-extrabold text-primary">Pickup date</span><select required value={pickupDate} onChange={event => setPickupDate(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary">{validPickupDates.map(date => <option key={date} value={date}>{formatPickupDateLabel(date, data.store.country)}</option>)}</select></label>
            <label><span className="font-sans text-xs font-extrabold text-primary">Pickup time</span><select required value={pickupSession} onChange={event => setPickupSession(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary">{data.store.pickupSessions.map(session => <option key={session}>{session}</option>)}</select></label>
            <label><span className="font-sans text-xs font-extrabold text-primary">Pickup location</span><select required value={pickupLocationId} onChange={event => setPickupLocationId(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary">{data.store.pickupLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            <label><span className="font-sans text-xs font-extrabold text-primary">Order closing time</span><input required type="datetime-local" value={closesAt} onChange={event => setClosesAt(event.target.value)} className="mt-2 w-full rounded-2xl bg-surface-container-low px-4 py-3 font-sans text-sm font-bold text-primary" /></label>
          </div>
          <button disabled={busy} className="mt-5 rounded-full bg-primary px-6 py-3 font-sans text-xs font-extrabold text-on-primary disabled:opacity-50">Create Group</button>
        </form>
      )}

      {groups.length > 0 && <section><h2 className="font-display text-3xl font-bold text-primary">Your Group Orders</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{groups.map(group => <article key={group.id} className="rounded-3xl border border-surface-container-high bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-bold text-primary">{group.name}</h3><p className="mt-1 font-sans text-xs font-extrabold uppercase tracking-wider text-secondary">{group.status}</p></div><CalendarClock className="h-5 w-5 text-secondary" /></div><dl className="mt-5 grid grid-cols-2 gap-3"><div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Orders</dt><dd className="font-display text-2xl font-bold text-primary">{group.orderCount}</dd></div><div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Group Sales</dt><dd className="font-sans text-lg font-extrabold text-primary">{formatRegionCurrency(group.eligibleSales, data.store.currency)}</dd></div><div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Estimated Reward</dt><dd className="font-sans text-lg font-extrabold text-secondary">{formatRegionCurrency(group.estimatedReward, data.store.currency)}</dd></div><div><dt className="font-sans text-[10px] font-extrabold uppercase text-outline">Pickup</dt><dd className="font-sans text-xs font-extrabold text-primary">{formatPickupDateLabel(group.pickupDate, data.store.country)} · {group.pickupSession}</dd></div></dl><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => share(group)} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 font-sans text-xs font-extrabold text-on-primary"><Share2 className="h-4 w-4" /> Share Group</button><button type="button" onClick={() => navigator.clipboard.writeText(shareUrl(group.shareCode)).then(() => setMessage('Group link copied.'))} className="inline-flex items-center justify-center gap-2 rounded-full bg-surface-container px-4 py-3 font-sans text-xs font-extrabold text-primary"><Copy className="h-4 w-4" /> Copy Link</button></div></article>)}</div></section>}
    </div>
  );
}
