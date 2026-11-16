import React from 'react';
import { AlertTriangle, ArrowRight, Store, TrendingUp } from 'lucide-react';

export type OwnerMetricState = 'loading' | 'ready' | 'no-data' | 'permission-denied' | 'error';

export interface OwnerMetricCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  helper: string;
  tone: string;
  state?: OwnerMetricState;
  onClick?: () => void;
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
  value: string;
  state: OwnerMetricState;
}

const getStateValue = (state: OwnerMetricState | undefined, value: string) => {
  if (state === 'loading') return 'Loading…';
  if (state === 'no-data') return 'No data available';
  if (state === 'permission-denied') return 'Access unavailable';
  if (state === 'error') return 'Unable to load';
  return value;
};

const getStateHelper = (state: OwnerMetricState | undefined, helper: string) => {
  if (state === 'no-data') return 'No records exist for this period.';
  if (state === 'permission-denied') return 'Check workspace access.';
  if (state === 'error') return 'Use Retry above.';
  return helper;
};

export function OwnerHomeHeader({ date, greeting, workspaceName, monthContext }: {
  date: string;
  greeting: string;
  workspaceName?: string;
  monthContext: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-surface-container-high pb-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-on-surface-variant">{date}</p>
        <h1 className="break-words font-display text-3xl font-bold leading-tight text-primary sm:text-4xl">{greeting}</h1>
      </div>
      <div className="min-w-0 sm:text-right">
        <p className="flex items-start gap-1.5 text-sm font-extrabold text-primary sm:justify-end">
          <Store aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{workspaceName || 'Current workspace'}</span>
        </p>
        <p className="text-xs font-semibold text-on-surface-variant">Month to date · {monthContext}</p>
      </div>
    </header>
  );
}

export function OwnerMetricSection({ title, cards, layout = 'cards' }: {
  title: string;
  cards: OwnerMetricCard[];
  layout?: 'cards' | 'rows';
}) {
  const isList = layout === 'rows';

  return (
    <section className={isList ? 'rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4' : ''}>
      <h2 className={isList ? 'font-display text-2xl font-bold leading-none text-primary' : 'sr-only'}>{title}</h2>
      <div className={isList ? 'mt-2 divide-y divide-surface-container-high' : 'grid gap-2.5 sm:grid-cols-3'}>
        {cards.map(card => {
          const iconStyle = card.tone === 'warning'
            ? 'bg-yellow-100 text-yellow-900'
            : 'bg-primary/10 text-primary';
          const content = (
            <>
              <span aria-hidden="true" className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}>{card.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-primary">{card.label}</p>
                {card.state !== 'loading' && (
                  <p className="text-xs font-semibold leading-snug text-on-surface-variant">{getStateHelper(card.state, card.helper)}</p>
                )}
              </div>
              <p className={`min-w-0 break-words font-bold tabular-nums text-primary ${isList
                ? 'col-start-3 row-start-1 text-right text-sm'
                : 'col-start-3 row-start-1 text-right text-base sm:col-span-2 sm:col-start-1 sm:row-start-2 sm:text-left sm:text-2xl'}`}>
                {getStateValue(card.state, card.value)}
              </p>
            </>
          );
          const className = isList
            ? 'grid w-full grid-cols-[auto_minmax(0,1fr)_minmax(0,5.25rem)_auto] items-center gap-2.5 py-2.5 text-left'
            : 'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,auto)] items-center gap-x-3 gap-y-2 rounded-xl sm:grid-cols-[auto_minmax(0,1fr)] border border-surface-container-high bg-surface-container-lowest px-3 py-2.5 sm:p-3';

          return card.onClick ? (
            <button key={card.label} type="button" onClick={card.onClick}
              className={`${className} hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}>
              {content}
              <ArrowRight aria-hidden="true" className="col-start-4 row-start-1 size-3.5 text-primary" />
            </button>
          ) : (
            <div key={card.label} className={className}>{content}{isList && <span aria-hidden="true" className="size-3.5" />}</div>
          );
        })}
      </div>
    </section>
  );
}

export function OwnerQuickActions({ actions }: { actions: OwnerQuickAction[] }) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4">
      <h2 className="text-sm font-extrabold text-primary">Quick Actions</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {actions.map(action => (
          <button key={action.label} type="button" onClick={action.onClick} className="flex items-center gap-3 rounded-xl border border-surface-container-high bg-surface-container-low p-2.5 text-left hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
            <span className="rounded-full bg-primary p-2 text-on-primary">{action.icon}</span>
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

export function OwnerNeedsAttention({ items, state, isIncomplete = false }: { items: OwnerAttentionItem[]; state: OwnerMetricState; isIncomplete?: boolean }) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-primary">Needs Attention</h2>
          <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">{getStateValue(state, `${items.length} ${items.length === 1 ? 'alert' : 'alerts'}`)}</p>
        </div>
        <AlertTriangle className="h-5 w-5 text-outline" />
      </div>
      <div className="mt-4 space-y-2">
        {isIncomplete && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-4">
            <p className="font-sans text-sm font-extrabold text-error">Some alert sources are unavailable.</p>
            <p className="mt-1 font-sans text-xs font-bold text-error">Retry the dashboard before treating this list as complete.</p>
          </div>
        )}
        {state === 'loading' ? null : items.length > 0 ? items.map(item => (
          <div key={item.id} className="rounded-xl border border-yellow-200 bg-yellow-50 p-2.5">
            <p className="font-sans text-sm font-extrabold text-yellow-900">{item.title}</p>
            <p className="mt-1 font-sans text-xs font-bold text-yellow-800">{item.detail}</p>
          </div>
        )) : state === 'ready' && !isIncomplete ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-2.5">
            <p className="font-sans text-sm font-extrabold text-green-900">Nothing urgent right now.</p>
            <p className="mt-1 font-sans text-xs font-bold text-green-800">All available operational checks completed with zero alerts.</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function OwnerRecentActivity({ items, formatTimestamp, isIncomplete = false }: { items: OwnerActivityItem[]; formatTimestamp: (timestamp: string) => string; isIncomplete?: boolean }) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4">
      <h2 className="text-sm font-extrabold text-primary">Recent Activity</h2>
      <div className="mt-4 space-y-2">
        {isIncomplete && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-4">
            <p className="font-sans text-sm font-extrabold text-error">Some activity sources could not be loaded.</p>
          </div>
        )}
        {items.length > 0 ? items.map(item => (
          <div key={item.id} className="flex items-start justify-between gap-4 rounded-xl border border-surface-container-high bg-surface-container-low p-2.5">
            <div>
              <p className="font-sans text-sm font-extrabold text-primary">{item.label}</p>
              <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">{item.detail}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1 font-sans text-[10px] font-extrabold text-outline">{formatTimestamp(item.timestamp)}</span>
          </div>
        )) : !isIncomplete ? (
          <div className="rounded-xl border border-surface-container-high bg-surface-container-low p-2.5">
            <p className="font-sans text-sm font-extrabold text-primary">No business activity recorded yet.</p>
            <p className="mt-1 font-sans text-xs font-bold text-on-surface-variant">Use quick actions to start today’s work.</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function OwnerBusinessSnapshot({ items }: { items: OwnerSnapshotItem[] }) {
  return (
    <article className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-primary">Business Snapshot</h2>
          <p className="mt-1 font-sans text-sm font-bold text-on-surface-variant">Current operating data.</p>
        </div>
        <TrendingUp className="h-5 w-5 text-outline" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-xl border border-surface-container-high bg-surface-container-low p-2.5 text-center">
            <p className="font-display text-2xl font-bold text-primary">{getStateValue(item.state, item.value)}</p>
            <p className="mt-1 font-sans text-[10px] font-extrabold uppercase tracking-[0.14em] text-outline">{item.label}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
