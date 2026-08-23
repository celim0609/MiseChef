import { useEffect, useState } from 'react';
import { groupOrderService } from './services';
import type { PublicGroupOrder } from './types';
import PublicStorePage from './PublicStorePage';

export default function PublicGroupOrderPage({ shareCode }: { shareCode: string }) {
  const [group, setGroup] = useState<PublicGroupOrder | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    groupOrderService.getPublic(shareCode).then(setGroup).catch(reason => setError(reason instanceof Error ? reason.message : 'This Group Order is unavailable.'));
  }, [shareCode]);
  if (error) return <p className="rounded-3xl bg-surface-container-low p-10 text-center font-sans font-bold text-on-surface-variant">{error}</p>;
  if (!group) return <div className="h-80 animate-pulse rounded-3xl bg-surface-container-low" />;
  return <PublicStorePage slug={group.storeSlug} groupOrder={group} />;
}
