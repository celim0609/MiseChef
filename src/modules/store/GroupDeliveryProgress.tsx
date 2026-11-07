import React from 'react';
import type { DeliveryProgress } from './services/groupDeliveryService';

export default function GroupDeliveryProgress({ progress }: { progress: DeliveryProgress }) {
  const count = progress.paidPortions || 0;
  return <section aria-label="Group progress / 团购进度" className="space-y-3 rounded-2xl bg-surface-container-low p-5">
    <p className="text-2xl font-bold">{count} / 10 paid lunch portions · 已付款午餐份数</p>
    <progress aria-label="Lunch portions / 午餐份数" value={Math.min(count, 10)} max={10} className="w-full" />
    <p>{progress.status === 'approved' ? 'Free delivery approved / 免费配送已获批' : progress.status === 'closed' ? 'Reservations closed / 预订已截止' : count >= 10 ? 'Group Qualified · Awaiting Approval (Owner/Manager review) / 已达标，等待店主或经理审核' : 'Gathering neighbours / 邻里拼团中'}</p>
    <p>Only confirmed meal payments count. / 仅计入已确认付款的午餐。</p>
    <p className="font-bold">RM0 customer delivery charge after group approval. / 成团获批后，顾客配送费为RM0。</p>
    {progress.deliveryWindow && <p>Delivery 11:00 AM–1:00 PM MYT</p>}
    {progress.closesAt && <p>Closes / 截止：{new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(progress.closesAt))} (MYT)</p>}
  </section>;
}
