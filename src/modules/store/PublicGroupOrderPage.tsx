import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { groupOrderService } from './services';
import type { PublicGroupOrder } from './types';
import PublicStorePage from './PublicStorePage';

export default function PublicGroupOrderPage({ shareCode, currentUser, onStoreResolved }: { shareCode: string; currentUser: User | null; onStoreResolved?: (storeSlug: string) => void }) {
  const [group, setGroup] = useState<PublicGroupOrder | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    groupOrderService.getPublic(shareCode).then(result => {
      setGroup(result);
      onStoreResolved?.(result.storeSlug);
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'This Group Order is unavailable.'));
  }, [onStoreResolved, shareCode]);
  if (error) return <p className="rounded-3xl bg-surface-container-low p-10 text-center font-sans font-bold text-on-surface-variant">{error}</p>;
  if (!group) return <div className="h-80 animate-pulse rounded-3xl bg-surface-container-low" />;
  return <PublicStorePage slug={group.storeSlug} groupOrder={group} currentUser={currentUser} />;
}
