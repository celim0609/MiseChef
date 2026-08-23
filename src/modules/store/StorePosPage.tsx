import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  History,
  Moon,
  PackageCheck,
  Search,
  Store,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { storeOrderService, storeService } from './services';
import WhatsAppCustomerButton from './WhatsAppCustomerButton';
import {
  countActiveOnlineOrders,
  filterHistoryOrders,
  formatMalaysiaBusinessDate,
  getMalaysiaDateRange,
  getOrderCompletionTimestamp,
  isOrderCompletedOnMalaysiaDate,
  shiftDateKey,
  toActivePosStatus,
  toMalaysiaDateKey,
  type ActivePosStatus,
  type OrderHistoryFilter
} from './posOrderModel';
import type { StoreFulfilmentStatus, StoreOrder } from './types';

const ACTIVE_COLUMNS: Array<{
  status: ActivePosStatus;
  label: string;
  border: string;
  tint: string;
  badge: string;
  action: string;
  actionLabel: string;
  icon: typeof BellRing;
}> = [
  { status: 'New', label: 'New', border: 'border-amber-400', tint: 'bg-amber-50', badge: 'bg-amber-500 text-white', action: 'bg-amber-400 text-slate-950', actionLabel: 'Accept → Preparing', icon: BellRing },
  { status: 'Preparing', label: 'Preparing', border: 'border-orange-500', tint: 'bg-orange-50', badge: 'bg-orange-500 text-white', action: 'bg-orange-500 text-white', actionLabel: 'Mark as Ready', icon: ChefHat },
  { status: 'Ready', label: 'Ready', border: 'border-emerald-500', tint: 'bg-emerald-50', badge: 'bg-emerald-600 text-white', action: 'bg-emerald-600 text-white', actionLabel: 'Complete Order', icon: PackageCheck }
];

const CANCELLATION_REASONS = [
  'Customer requested cancellation',
  'Item unavailable',
  'Duplicate order',
  'Store unable to fulfil',
  'Other'
] as const;

const HISTORY_FILTERS: Array<{ id: OrderHistoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'paid', label: 'Paid' },
  { id: 'pending', label: 'Pending Payment' }
];

const nextFulfilmentStatus = (status: StoreOrder['fulfilmentStatus']): StoreFulfilmentStatus | null => {
  if (status === 'New' || status === 'Paid' || status === 'Confirmed') return 'Preparing';
  if (status === 'Preparing') return 'Ready';
  if (status === 'Ready') return 'Completed';
  return null;
};

const formatRelativeTime = (value: string, now: number) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1_000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
};

const formatMalaysiaTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
};

const paymentStatusLabel = (status: StoreOrder['payment']['status']) => ({
  pending: 'Pending Payment',
  pending_verification: 'Pending Verification',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Payment Failed',
  cancelled: 'Payment Cancelled',
  rejected: 'Payment Rejected'
})[status];

const createAlertToneUrl = () => {
  const sampleRate = 8_000;
  const durationSeconds = 0.24;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount;
    const envelope = Math.sin(Math.PI * progress) * (1 - progress * 0.55);
    const tone = Math.sin(2 * Math.PI * 880 * index / sampleRate)
      + 0.35 * Math.sin(2 * Math.PI * 1320 * index / sampleRate);
    view.setInt16(44 + index * 2, Math.round(tone * envelope * 11_000), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
};

interface StorePosPageProps {
  storeId: string;
  workspaceId: string;
  workspaceName: string;
  onBack: () => void;
  notificationAction?: ReactNode;
}

export default function StorePosPage({ storeId, workspaceId, workspaceName, onBack, notificationAction }: StorePosPageProps) {
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<StoreOrder[]>([]);
  const [storeDisplayName, setStoreDisplayName] = useState('Loading Store…');
  const [storeNameForMessages, setStoreNameForMessages] = useState('');
  const [storeCountry, setStoreCountry] = useState<'MY' | 'SG' | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [isNightMode, setIsNightMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [activeView, setActiveView] = useState<'live' | 'history'>('live');
  const [historyDateKey, setHistoryDateKey] = useState(() => toMalaysiaDateKey());
  const [historyDateBasis, setHistoryDateBasis] = useState<'created' | 'completed'>('created');
  const [historyFilter, setHistoryFilter] = useState<OrderHistoryFilter>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyOrders, setHistoryOrders] = useState<StoreOrder[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isCompletedLoading, setIsCompletedLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [cancelOrder, setCancelOrder] = useState<StoreOrder | null>(null);
  const [cancellationChoice, setCancellationChoice] = useState('');
  const [otherCancellationReason, setOtherCancellationReason] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasHydratedRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const url = createAlertToneUrl();
    audio.src = url;
    return () => URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void storeService.getWorkspaceStore(workspaceId)
      .then(store => {
        if (!cancelled) {
          setStoreDisplayName(store?.name || 'Store not configured');
          setStoreNameForMessages(store?.name || '');
          setStoreCountry(store?.country === 'SG' ? 'SG' : 'MY');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStoreDisplayName('Store unavailable');
          setStoreNameForMessages('');
          setStoreCountry('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const playAlert = () => {
    if (!soundEnabledRef.current || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    void audioRef.current.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
  };

  useEffect(() => {
    hasHydratedRef.current = false;
    setIsLoading(true);
    setErrorMessage('');
    return storeOrderService.subscribePosOrders(
      storeId,
      workspaceId,
      (nextOrders, addedNewOrderIds) => {
        setOrders(nextOrders);
        setLastUpdated(new Date());
        setNow(Date.now());
        setIsLoading(false);
        if (!hasHydratedRef.current) {
          hasHydratedRef.current = true;
          return;
        }
        if (addedNewOrderIds.length > 0) playAlert();
      },
      error => {
        setIsLoading(false);
        setErrorMessage(error.message || 'Unable to load the live order queue.');
      }
    );
  }, [storeId, workspaceId]);

  useEffect(() => {
    setIsCompletedLoading(true);
    return storeOrderService.subscribeCompletedOrders(
      storeId,
      workspaceId,
      nextOrders => {
        setCompletedOrders(nextOrders);
        setIsCompletedLoading(false);
      },
      error => {
        setIsCompletedLoading(false);
        setErrorMessage(error.message || 'Unable to load completed orders.');
      }
    );
  }, [storeId, workspaceId]);

  useEffect(() => {
    if (activeView !== 'history' || historyDateBasis !== 'created') return;
    let cancelled = false;
    const { start, end } = getMalaysiaDateRange(historyDateKey);
    setIsHistoryLoading(true);
    setHistoryError('');
    void storeOrderService.getOrdersForBusinessDate(storeId, workspaceId, start, end)
      .then(nextOrders => {
        if (!cancelled) setHistoryOrders(nextOrders);
      })
      .catch(error => {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : 'Unable to load Order History.');
      })
      .finally(() => {
        if (!cancelled) setIsHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, historyDateBasis, historyDateKey, historyRefreshKey, storeId, workspaceId]);

  const groupedOrders = useMemo(() => ACTIVE_COLUMNS.reduce<Record<ActivePosStatus, StoreOrder[]>>(
    (groups, column) => {
      groups[column.status] = orders.filter(order => toActivePosStatus(order.fulfilmentStatus) === column.status);
      return groups;
    },
    { New: [], Preparing: [], Ready: [] }
  ), [orders]);

  const todayKey = toMalaysiaDateKey(now);
  const completedTodayOrders = completedOrders.filter(order => isOrderCompletedOnMalaysiaDate(order, todayKey));
  const completedTodayCount = completedTodayOrders.length;
  const activeOnlineOrderCount = countActiveOnlineOrders(orders);
  const historySourceOrders = useMemo(
    () => historyDateBasis === 'completed'
      ? completedOrders.filter(order => isOrderCompletedOnMalaysiaDate(order, historyDateKey))
      : historyOrders,
    [completedOrders, historyDateBasis, historyDateKey, historyOrders]
  );
  const visibleHistoryOrders = useMemo(
    () => filterHistoryOrders(historySourceOrders, historyFilter, historySearch),
    [historyFilter, historySearch, historySourceOrders]
  );

  const advanceOrder = async (order: StoreOrder) => {
    const nextStatus = nextFulfilmentStatus(order.fulfilmentStatus);
    if (!nextStatus || updatingOrderId) return;
    setUpdatingOrderId(order.id);
    setErrorMessage('');
    try {
      await storeOrderService.updateFulfilment(order.id, nextStatus);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update this order.');
    } finally {
      setUpdatingOrderId('');
    }
  };

  const openCancellation = (order: StoreOrder) => {
    setCancelOrder(order);
    setCancellationChoice('');
    setOtherCancellationReason('');
  };

  const closeCancellation = () => {
    if (updatingOrderId) return;
    setCancelOrder(null);
    setCancellationChoice('');
    setOtherCancellationReason('');
  };

  const cancellationReason = cancellationChoice === 'Other' ? `Other: ${otherCancellationReason.trim()}` : cancellationChoice;
  const canConfirmCancellation = Boolean(cancelOrder && cancellationChoice && (cancellationChoice !== 'Other' || otherCancellationReason.trim()) && cancellationReason.length <= 240);

  const confirmCancellation = async () => {
    if (!cancelOrder || !canConfirmCancellation || updatingOrderId) return;
    setUpdatingOrderId(cancelOrder.id);
    setErrorMessage('');
    try {
      await storeOrderService.updateFulfilment(cancelOrder.id, 'Cancelled', cancellationReason);
      setCancelOrder(null);
      setHistoryRefreshKey(current => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to cancel this order.');
    } finally {
      setUpdatingOrderId('');
    }
  };

  const toggleSound = () => {
    const nextEnabled = !soundEnabled;
    setSoundEnabled(nextEnabled);
    soundEnabledRef.current = nextEnabled;
    if (nextEnabled) playAlert();
    else setAudioBlocked(false);
  };

  const openHistory = (filter: OrderHistoryFilter = 'all') => {
    setHistoryDateKey(toMalaysiaDateKey());
    setHistoryDateBasis('created');
    setHistoryFilter(filter);
    setHistorySearch('');
    setHistoryError('');
    setActiveView('history');
  };

  const openCompletedHistory = () => {
    setHistoryDateKey(toMalaysiaDateKey());
    setHistoryDateBasis('completed');
    setHistoryFilter('completed');
    setHistorySearch('');
    setHistoryError('');
    setActiveView('history');
  };

  const paymentClass = (order: StoreOrder) => order.payment.status === 'paid'
    ? isNightMode ? 'text-emerald-300' : 'text-emerald-700'
    : isNightMode ? 'text-amber-300' : 'text-amber-700';

  return (
    <section data-pos-theme={isNightMode ? 'dark' : 'light'} className={`pos-screen flex min-h-screen flex-col transition-colors ${isNightMode ? 'bg-[#07111f] text-white' : 'bg-slate-100 text-slate-950'}`}>
      <audio ref={audioRef} preload="auto" aria-hidden="true" />

      <header className={`pos-light-surface flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6 ${isNightMode ? 'border-white/10 bg-[#0b1727]' : 'border-slate-300 bg-white'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Back to Store" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${isNightMode ? 'border-white/15 bg-white/5 text-white' : 'border-slate-300 bg-slate-100 text-slate-900'}`}><ArrowLeft className="h-6 w-6" /></button>
          <div className="min-w-0">
            <div className="flex items-center gap-3"><span className={`text-lg font-black ${isNightMode ? 'text-white' : 'text-slate-950'}`}>POS</span><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${isNightMode ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" /> Live</span></div>
            <h1 className={`pos-page-title truncate text-2xl font-black tracking-tight sm:text-3xl ${isNightMode ? 'text-white' : 'text-slate-950'}`}>{workspaceName}</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {audioBlocked && <p className="text-sm font-bold text-amber-300">Tap Sound to enable alerts.</p>}
          <button type="button" onClick={() => activeView === 'live' ? openHistory() : setActiveView('live')} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-white/15 bg-white/5 text-white' : 'border-slate-300 bg-slate-100 text-slate-900'}`}>{activeView === 'live' ? <History className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}{activeView === 'live' ? 'View Orders' : 'Live Queue'}</button>
          <button type="button" onClick={() => setIsNightMode(current => !current)} aria-pressed={isNightMode} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-blue-400/60 bg-blue-500/10 text-white' : 'border-slate-300 bg-slate-100 text-slate-900'}`}><Moon className="h-5 w-5" /><span>Night Mode</span><span className={`relative h-6 w-11 rounded-full transition-colors ${isNightMode ? 'bg-blue-500' : 'bg-slate-300'}`} aria-hidden="true"><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${isNightMode ? 'translate-x-6' : 'translate-x-1'}`} /></span></button>
          <button type="button" onClick={toggleSound} aria-pressed={soundEnabled} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-blue-300 bg-blue-50 text-blue-800'}`}>{soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}Sound {soundEnabled ? 'On' : 'Off'}</button>
          {notificationAction}
        </div>
      </header>

      {errorMessage && <p role="alert" className="mx-4 mt-3 rounded-xl border border-red-400 bg-red-950 px-5 py-3 text-sm font-black text-red-100 lg:mx-6">{errorMessage}</p>}

      {activeView === 'live' ? (
        <div className="flex-1 overflow-x-auto p-3 lg:p-4">
          <div className="grid min-h-full min-w-[1040px] grid-cols-[minmax(0,1fr)_220px] gap-4">
            <div className="grid grid-cols-[1.1fr_1.1fr_0.9fr] gap-4">
              {ACTIVE_COLUMNS.map(column => {
                const Icon = column.icon;
                const columnOrders = groupedOrders[column.status];
                return (
                  <section key={column.status} aria-labelledby={`pos-column-${column.status}`} className={`flex min-h-[65vh] flex-col rounded-2xl border border-t-4 ${column.border} ${isNightMode ? 'bg-[#0b1727]/90 text-white' : `${column.tint} text-slate-950`} p-3 shadow-lg`}>
                    <div className="mb-3 flex items-center justify-between gap-3 px-1"><h2 data-status={column.status.toLowerCase()} id={`pos-column-${column.status}`} className="pos-status-heading flex items-center gap-2 text-xl font-black tracking-tight"><Icon className="h-6 w-6" /> {column.label}</h2><span className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-base font-black ${column.badge}`}>{columnOrders.length}</span></div>
                    <div className="flex-1 space-y-3">
                      {columnOrders.map(order => (
                        <article key={order.id} className={`pos-light-surface rounded-2xl border-2 p-4 shadow-md ${isNightMode ? 'border-slate-700 bg-[#081321]' : 'border-slate-300 bg-white'}`}>
                          <div className="flex items-start justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${column.badge}`}>{column.label}</span><time className={`shrink-0 text-sm font-black ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`} dateTime={order.createdAt}>{formatRelativeTime(order.createdAt, now)}</time></div>
                          <h3 className={`pos-card-title mt-4 text-2xl font-black leading-none ${isNightMode ? 'text-white' : 'text-slate-950'}`}>{order.orderNumber}</h3>
                          {order.pickupCode && <p className={`mt-2 inline-flex rounded-lg px-3 py-1.5 text-xl font-black tracking-[0.18em] ${isNightMode ? 'bg-blue-400 text-slate-950' : 'bg-blue-100 text-blue-950'}`}><span className="sr-only">Pickup Code </span>{order.pickupCode}</p>}
                          <p className={`mt-3 text-sm font-extrabold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}><span className="capitalize">{order.orderSource || 'online'}</span><span className="px-1.5">·</span><span className={paymentClass(order)}>{paymentStatusLabel(order.payment.status)}</span></p>
                          <ul className={`mt-4 space-y-3 border-t pt-4 ${isNightMode ? 'border-slate-700' : 'border-slate-200'}`}>{order.items.map((item, index) => <li key={`${order.id}-${item.productId}-${index}`} className={`flex gap-2 text-lg font-black leading-tight ${isNightMode ? 'text-white' : 'text-slate-950'}`}><span className={`min-w-8 text-right ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.quantity}×</span><span>{item.productName}{item.selectedOptions.length > 0 && <span className={`mt-1 block text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.selectedOptions.map(option => option.optionName).join(', ')}</span>}</span></li>)}</ul>
                          {order.notes && <p className="mt-4 rounded-xl bg-amber-100 px-3 py-2 text-sm font-extrabold text-amber-950">Note: {order.notes}</p>}
                          <button type="button" disabled={Boolean(updatingOrderId)} onClick={() => void advanceOrder(order)} className={`mt-5 min-h-14 w-full rounded-xl px-4 text-lg font-black shadow-md active:scale-[0.98] disabled:opacity-50 ${column.action}`}>{updatingOrderId === order.id ? 'Updating…' : column.actionLabel}</button>
                          {storeCountry && <WhatsAppCustomerButton order={order} country={storeCountry} storeName={storeNameForMessages} className="mt-2 w-full" />}
                          <button type="button" disabled={Boolean(updatingOrderId)} onClick={() => openCancellation(order)} className={`mt-2 min-h-12 w-full rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-rose-400/50 text-rose-200' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>Cancel Order</button>
                        </article>
                      ))}
                      {!isLoading && columnOrders.length === 0 && <p className={`px-4 py-4 text-center text-sm font-extrabold ${isNightMode ? 'text-slate-300' : 'text-slate-600'}`}>No orders</p>}
                      {isLoading && <p className={`px-4 py-4 text-center text-sm font-extrabold ${isNightMode ? 'text-slate-300' : 'text-slate-600'}`}>Loading live orders…</p>}
                    </div>
                  </section>
                );
              })}
            </div>

            <aside className={`pos-light-surface self-start rounded-2xl border p-4 shadow-lg ${isNightMode ? 'border-slate-700 bg-[#0b1727] text-white' : 'border-slate-300 bg-white text-slate-950'}`}><div className="flex items-center gap-2 text-blue-500"><CheckCircle2 className="h-6 w-6" /><h2 className="pos-readable-heading text-lg font-black">Completed</h2></div><p className="mt-4 text-4xl font-black">{completedTodayCount}</p><p className={`mt-1 text-sm font-bold ${isNightMode ? 'text-slate-300' : 'text-slate-600'}`}>completed today</p><button type="button" onClick={openCompletedHistory} className={`mt-5 min-h-12 w-full rounded-xl border px-3 text-sm font-black ${isNightMode ? 'border-blue-400/40 bg-blue-500/10 text-blue-200' : 'border-blue-300 bg-blue-50 text-blue-800'}`}>View Completed</button></aside>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-4 lg:p-6">
          <section className={`pos-light-surface mx-auto max-w-7xl rounded-2xl border p-4 shadow-lg lg:p-6 ${isNightMode ? 'border-slate-700 bg-[#0b1727] text-white' : 'border-slate-300 bg-white text-slate-950'}`}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className={`text-xs font-black uppercase tracking-[0.16em] ${isNightMode ? 'text-blue-300' : 'text-blue-700'}`}>{historyDateBasis === 'completed' ? 'Completion date' : 'Creation date'} · Malaysia UTC+8</p><h2 className="pos-readable-heading mt-1 text-3xl font-black">{historyDateBasis === 'completed' ? 'Completed Orders' : 'Order History'}</h2></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setHistoryDateKey(toMalaysiaDateKey())} className={`min-h-12 rounded-xl border px-3 text-sm font-black ${isNightMode ? 'border-slate-600 text-white' : 'border-slate-300 text-slate-900'}`}>Today</button><button type="button" onClick={() => setHistoryDateKey(shiftDateKey(toMalaysiaDateKey(), -1))} className={`min-h-12 rounded-xl border px-3 text-sm font-black ${isNightMode ? 'border-slate-600 text-white' : 'border-slate-300 text-slate-900'}`}>Yesterday</button><button type="button" onClick={() => setHistoryDateKey(shiftDateKey(historyDateKey, -1))} aria-label="Previous date" className={`flex h-12 w-12 items-center justify-center rounded-xl border ${isNightMode ? 'border-slate-600 text-white' : 'border-slate-300 text-slate-900'}`}><ChevronLeft className="h-6 w-6" /></button><div className={`flex min-h-12 items-center gap-2 rounded-xl border px-4 font-black ${isNightMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-300 bg-slate-50 text-slate-900'}`}><CalendarDays className="h-5 w-5" />{formatMalaysiaBusinessDate(historyDateKey)}</div><button type="button" disabled={historyDateKey >= toMalaysiaDateKey()} onClick={() => setHistoryDateKey(shiftDateKey(historyDateKey, 1))} aria-label="Next date" className={`flex h-12 w-12 items-center justify-center rounded-xl border disabled:opacity-35 ${isNightMode ? 'border-slate-600 text-white' : 'border-slate-300 text-slate-900'}`}><ChevronRight className="h-6 w-6" /></button><label className={`pos-control flex min-h-12 items-center gap-2 rounded-xl border px-3 ${isNightMode ? 'border-slate-600 bg-slate-900' : 'border-slate-300 bg-white'}`}><span className="sr-only">Select date</span><input type="date" max={toMalaysiaDateKey()} value={historyDateKey} onChange={event => event.target.value && setHistoryDateKey(event.target.value)} className="pos-control bg-transparent text-sm font-black" /></label></div></div>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{historyDateBasis === 'created' ? HISTORY_FILTERS.map(filter => <button key={filter.id} type="button" onClick={() => setHistoryFilter(filter.id)} aria-pressed={historyFilter === filter.id} className={`min-h-11 rounded-full px-4 text-sm font-black ${historyFilter === filter.id ? 'bg-blue-600 text-white' : isNightMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>{filter.label}</button>) : <><button type="button" aria-pressed="true" className="min-h-11 rounded-full bg-blue-600 px-4 text-sm font-black text-white">Completed</button><button type="button" onClick={() => { setHistoryDateBasis('created'); setHistoryFilter('all'); }} className={`min-h-11 rounded-full px-4 text-sm font-black ${isNightMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>View Creation-date History</button></>}</div><label className={`pos-control flex min-h-12 min-w-[260px] items-center gap-2 rounded-xl border px-3 ${isNightMode ? 'border-slate-600 bg-slate-900' : 'border-slate-300 bg-white'}`}><Search className="h-5 w-5 text-slate-400" /><span className="sr-only">Search order number</span><input value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="Search order #" className="pos-control w-full bg-transparent text-sm font-bold outline-none" /></label></div>
            {historyError && <p role="alert" className="mt-4 rounded-xl bg-rose-950 px-4 py-3 text-sm font-black text-rose-100">{historyError}</p>}
            {(historyDateBasis === 'completed' ? isCompletedLoading : isHistoryLoading) ? <p className="py-16 text-center font-black">Loading Order History…</p> : visibleHistoryOrders.length === 0 ? <p className={`py-16 text-center font-black ${isNightMode ? 'text-slate-300' : 'text-slate-600'}`}>No orders for this date and filter.</p> : <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{visibleHistoryOrders.map(order => {
              const isCancelled = order.fulfilmentStatus === 'Cancelled';
              const isCompleted = order.fulfilmentStatus === 'Completed';
              const canCancel = Boolean(toActivePosStatus(order.fulfilmentStatus));
              const historyTimestamp = historyDateBasis === 'completed' ? getOrderCompletionTimestamp(order) : order.createdAt;
              return <article key={order.id} className={`rounded-2xl border-2 p-4 ${isCancelled ? isNightMode ? 'border-rose-800 bg-rose-950/40' : 'border-rose-200 bg-rose-50' : isNightMode ? 'border-slate-700 bg-[#081321]' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${isCancelled ? 'bg-rose-600 text-white' : isCompleted ? 'bg-slate-600 text-white' : 'bg-blue-600 text-white'}`}>{order.fulfilmentStatus || 'Order'}</span><time className={`text-xs font-black ${isNightMode ? 'text-slate-200' : 'text-slate-600'}`}>{historyDateBasis === 'completed' ? 'Completed' : 'Created'} {formatMalaysiaTimestamp(historyTimestamp)}</time></div><h3 className="pos-readable-heading mt-3 text-xl font-black">{order.orderNumber}</h3>{order.pickupCode && <p className={`mt-2 text-sm font-black tracking-[0.16em] ${isNightMode ? 'text-blue-200' : 'text-blue-800'}`}>Pickup {order.pickupCode}</p>}<p className={`mt-2 text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}><span className="capitalize">{order.orderSource}</span> · <span className={paymentClass(order)}>{paymentStatusLabel(order.payment.status)}</span></p><ul className={`mt-3 space-y-2 border-t pt-3 ${isNightMode ? 'border-slate-700' : 'border-slate-200'}`}>{order.items.map((item, index) => <li key={`${order.id}-history-${index}`} className="font-black">{item.quantity}× {item.productName}{item.selectedOptions.length > 0 && <span className={`block pl-5 text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.selectedOptions.map(option => option.optionName).join(', ')}</span>}</li>)}</ul>{order.notes && <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">Note: {order.notes}</p>}{isCancelled && <div className={`mt-3 rounded-xl px-3 py-3 text-sm ${isNightMode ? 'bg-rose-950 text-rose-100' : 'bg-rose-100 text-rose-950'}`}><p className="font-black">Cancellation reason</p><p className="mt-1 font-bold">{order.cancellationReason || 'Not recorded'}</p><p className="mt-2 text-xs font-bold">Cancelled {formatMalaysiaTimestamp(order.cancelledAt)}</p></div>}{canCancel && <button type="button" onClick={() => openCancellation(order)} className={`mt-4 min-h-12 w-full rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-rose-400/50 text-rose-200' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>Cancel Order</button>}</article>;
            })}</div>}
          </section>
        </div>
      )}

      <footer className={`pos-light-surface mx-3 mb-3 grid gap-2 rounded-xl border px-4 py-2 sm:grid-cols-3 lg:mx-4 ${isNightMode ? 'border-slate-700 bg-[#0b1727] text-white' : 'border-slate-300 bg-white text-slate-950'}`}><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /><span><span className="block text-[10px] font-bold text-slate-400">Last Updated</span><span className="text-xs font-black">{lastUpdated ? lastUpdated.toLocaleTimeString() : 'Connecting…'}</span></span></div><div className="flex items-center gap-2"><Store className="h-5 w-5 text-slate-400" /><span><span className="block text-[10px] font-bold text-slate-400">Store</span><span className="text-xs font-black">{storeDisplayName}</span></span></div><div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-emerald-500" /><span><span className="block text-[10px] font-bold text-slate-400">Active Online Orders</span><span className="text-xs font-black">{activeOnlineOrderCount}</span></span></div></footer>

      {cancelOrder && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="cancel-order-title" className={`pos-light-surface w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${isNightMode ? 'border-slate-600 bg-[#0b1727] text-white' : 'border-slate-300 bg-white text-slate-950'}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-rose-500">Preserves order record</p><h2 id="cancel-order-title" className="pos-readable-heading mt-1 text-2xl font-black">Cancel Order</h2><p className="mt-1 text-lg font-black">{cancelOrder.orderNumber}</p></div><button type="button" onClick={closeCancellation} aria-label="Close cancellation dialog" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-400"><X className="h-5 w-5" /></button></div><p className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${isNightMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>This removes the order from the active kitchen queue but preserves it in Order History.</p>{cancelOrder.payment.status === 'paid' && <p className="mt-3 flex gap-2 rounded-xl border border-amber-400 bg-amber-100 px-4 py-3 text-sm font-black text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" />Canceling this order does not refund the payment.</p>}<fieldset className="mt-5"><legend className="text-sm font-black">Cancellation reason</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{CANCELLATION_REASONS.map(reason => <label key={reason} className={`pos-control flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${cancellationChoice === reason ? 'border-rose-500 bg-rose-50 text-rose-900' : isNightMode ? 'border-slate-600 bg-slate-900' : 'border-slate-300 bg-white'}`}><input type="radio" name="cancellation-reason" value={reason} checked={cancellationChoice === reason} onChange={() => setCancellationChoice(reason)} />{reason}</label>)}</div></fieldset>{cancellationChoice === 'Other' && <label className="mt-3 block text-sm font-black">Explain the reason<textarea autoFocus maxLength={233} value={otherCancellationReason} onChange={event => setOtherCancellationReason(event.target.value)} className="pos-control mt-2 min-h-24 w-full rounded-xl border border-slate-400 bg-white p-3 text-sm font-bold text-slate-950" placeholder="Required" /></label>}<div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={closeCancellation} disabled={Boolean(updatingOrderId)} className={`min-h-12 rounded-xl border px-4 font-black ${isNightMode ? 'border-slate-600 text-white' : 'border-slate-300 text-slate-800'}`}>Keep Order</button><button type="button" onClick={() => void confirmCancellation()} disabled={!canConfirmCancellation || Boolean(updatingOrderId)} className="min-h-12 rounded-xl bg-rose-600 px-4 font-black text-white disabled:opacity-40">{updatingOrderId ? 'Cancelling…' : 'Confirm Cancellation'}</button></div></section></div>}
    </section>
  );
}
