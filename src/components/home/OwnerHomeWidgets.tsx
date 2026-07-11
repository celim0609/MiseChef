import React from 'react';
import { AlertTriangle, CalendarDays, TrendingUp } from 'lucide-react';

export interface OwnerMetricCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  helper: string;
  tone: string;
  statusClassName?: string;
}

export interface OwnerQuickAction {
  label: string;
  detail: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

export interface OwnerAttentionItem {
  id: string;
  title: string;
  detail: string;
}

export interface OwnerActivityItem {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
}

export interface OwnerSnapshotItem {
  label: string;
  value: number;
}

export function OwnerHomeHeader({
  date,
  greeting,
  displayName,
  purchaseRatio,
  purchaseRatioLabel,
  purchaseRatioClassName
}: {
  date: string;
  greeting: string;
  displayName: string;
  purchaseRatio: string;
  purchaseRatioLabel: string;
  purchaseRatioClassName: string;
}) {
  return (
    <section className="rounded-3xl border border-surface-container-high bg-surface-container-low p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-secondary/10 px-3 py-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.2em] text-secondary">
            <CalendarDays className="h-3.5 w-3.5" /> {date}
          </div>
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-primary sm:text-5xl">
              {greeting}, {displayName}
            </h1>
            <p className="mt-3 max-w-2xl font-sans text-sm font-bold leading-relaxed text-on-surface-variant">
              Your daily restaurant command center: sales, invoice workflow, purchasing trends, and alerts without misleading food-cost shortcuts.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-surface-container-high bg-white px-5 py-4 shadow-sm">
          <p className="font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">Purchase Ratio</p>
          <p className="mt-1 font-display text-2xl font-bold text-primary">{purchaseRatio}</p>
          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 font-sans text-[10px] font-extrabold ${purchaseRatioClassName}`}>{purchaseRatioLabel}</span>
        </div>
      </div>
    </section>
  );
}

export function OwnerMetricSection({
  title,
  description,
  cards,
  isLoading,
  controls
}: {
  title: string;
  description: string;
  cards: OwnerMetricCard[];
  isLoading: boolean;
  controls?: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className={controls ? 'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between' : 'flex items-end justify-between gap-3'}>
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">{title}</p>
          <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">{description}</p>
        </div>
        {controls || (isLoading && <p className="font-sans text-xs font-extrabold text-outline">Refreshing...</p>)}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => (
          <article key={card.label} className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
            <span className={`inline-flex rounded-full p-2 ${card.tone === 'warning' ? 'bg-yellow-100 text-yellow-800' : card.tone === 'secondary' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
              {card.icon}
            </span>
            <p className="mt-5 font-sans text-[10px] font-extrabold uppercase tracking-[0.16em] text-outline">{card.label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-primary">{isLoading ? '...' : card.value}</p>
            {card.statusClassName ? (
              <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 font-sans text-[10px] font-extrabold ${card.statusClassName}`}>{card.helper}</span>
            ) : (
              <p className="mt-2 font-sans text-xs font-bold text-on-surface-variant">{card.helper}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function OwnerQuickActions({ actions }: { actions: OwnerQuickAction[] }) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
      <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Quick Actions</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {actions.map(action => (
          <button key={action.label} type="button" onClick={action.onClick} className="flex items-center gap-4 rounded-2xl border border-surface-container-high bg-surface-container-low p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]">
            <span className="rounded-full bg-primary px-3 py-3 text-on-primary">{action.icon}</span>
            <span>
              <span className="block font-sans text-sm font-extrabold text-primary">{action.label}</span>
              <span className="mt-1 block font-sans text-xs font-bold text-on-surface-variant">{action.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </article>
  );
}

export function OwnerNeedsAttention({ items }: { items: OwnerAttentionItem[] }) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Needs Attention</p>
          <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Operational items that could affect today’s work.</p>
        </div>
        <AlertTriangle className="h-5 w-5 text-outline" />
      </div>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? items.map(item => (
          <div key={item.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <p className="font-sans text-sm font-extrabold text-yellow-900">{item.title}</p>
            <p className="mt-1 font-sans text-xs font-bold text-yellow-800">{item.detail}</p>
          </div>
        )) : (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="font-sans text-sm font-extrabold text-green-900">Nothing urgent right now.</p>
            <p className="mt-1 font-sans text-xs font-bold text-green-800">Invoices, supplier pricing, ingredient prices, and recipe cost queues look clear.</p>
          </div>
        )}
      </div>
    </article>
  );
}

export function OwnerRecentActivity({ items, formatTimestamp }: { items: OwnerActivityItem[]; formatTimestamp: (timestamp: string) => string }) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
      <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Recent Activity</p>
      <div className="mt-4 space-y-3">
        {items.length > 0 ? items.map(item => (
          <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-surface-container-high bg-surface-container-low p-4">
            <div>
              <p className="font-sans text-sm font-extrabold text-primary">{item.label}</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{item.detail}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1 font-sans text-[10px] font-extrabold text-outline">{formatTimestamp(item.timestamp)}</span>
          </div>
        )) : (
          <div className="rounded-xl border border-surface-container-high bg-surface-container-low p-4">
            <p className="font-sans text-sm font-extrabold text-primary">No business activity recorded yet.</p>
            <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Use quick actions to start today’s work.</p>
          </div>
        )}
      </div>
    </article>
  );
}

export function OwnerBusinessSnapshot({ items, isLoading }: { items: OwnerSnapshotItem[]; isLoading: boolean }) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-sans text-xs font-extrabold uppercase tracking-[0.16em] text-primary">Business Snapshot</p>
          <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Current operating data.</p>
        </div>
        <TrendingUp className="h-5 w-5 text-outline" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-xl border border-surface-container-high bg-surface-container-low p-4 text-center">
            <p className="font-display text-2xl font-bold text-primary">{isLoading ? '...' : item.value}</p>
            <p className="mt-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-outline">{item.label}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
