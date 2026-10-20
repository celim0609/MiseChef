import ManualPosOrders from './ManualPosOrders';
import { getOrderTickets } from './orderTickets';
import DailyFulfilmentQueue, { DailyFulfilmentCard } from './DailyFulfilmentQueue';
import { dailyEntries, ticketInDailyView, type DailyView } from './dailyOrderModel';
import OrderTicketPanel from './OrderTicketPanel';
import HealthyLunchPurchasedOptions from './HealthyLunchPurchasedOptions';
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
  LoaderCircle,
  Moon,
  PackageCheck,
  Search,
  Store,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { storeOrderService, storeService } from './services';
import { formatStoreOrderSetSelection } from './storeOrderSnapshot';
import WhatsAppCustomerButton from './WhatsAppCustomerButton';
import { buildGroupKitchenEntries, type GroupKitchenEntry } from './groupKitchenOrderModel';
import {
  countActiveOnlineOrders,
  filterHistoryOrders,
  formatMalaysiaBusinessDate,
  getMalaysiaDateRange,
  getOrderCompletionTimestamp,
  isOrderCompletedOnMalaysiaDate,
  shiftDateKey,
  sortOrdersByDeliverySchedule,
  toActivePosStatus,
  toMalaysiaDateKey,
  type ActivePosStatus,
  type OrderHistoryFilter
} from './posOrderModel';
import type { StoreFulfilmentStatus, StoreOrder } from './types';
import type { StoreOptionGroup, StoreProduct, StoreSet } from './types';
import { getPosSourceLabel, isWalkInOrder, printWalkInReceipt } from './posWalkIn';
import { calculateStoreSetAnalysis, getDefaultStoreSetSelections, getStoreSetUnavailableReason } from './storeSetModel';
import { calculateStoreOptionAdjustedPrice } from './storeModel';

type ExternalCartItem = {
  key: string;
  label: string;
  quantity: number;
  selection: {
    productId?: string;
    setId?: string;
    selectedOptions: Array<{ groupId: string; optionId: string }>;
    selectedSetItems?: Array<{ groupId: string; productId: string }>;
  };
};

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
  const [posSection, setPosSection] = useState<'orders' | 'tickets'>('orders');
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<StoreOrder[]>([]);
  const [storeDisplayName, setStoreDisplayName] = useState('Loading Store…');
  const [storeNameForMessages, setStoreNameForMessages] = useState('');
  const [storeCountry, setStoreCountry] = useState<'MY' | 'SG' | ''>('');
  const [storePickupSessions, setStorePickupSessions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState('');
  const [updatingGroupId, setUpdatingGroupId] = useState('');
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
  const [dailyHistory, setDailyHistory] = useState<Awaited<ReturnType<typeof storeOrderService.getTerminalOrderHistoryPage>> | null>(null);
  const [loadingDailyHistory, setLoadingDailyHistory] = useState(false);
  const loadDailyHistory = async () => {
    setLoadingDailyHistory(true);
    try {
      const page = await storeOrderService.getTerminalOrderHistoryPage(storeId, workspaceId, dailyHistory?.cursor);
      setDailyHistory(previous => ({...page, orders: [...(previous?.orders || []), ...page.orders]}));
    } catch(error) {setErrorMessage(error instanceof Error ? error.message : 'Unable to load fulfilment history.');}
    finally {setLoadingDailyHistory(false);}
  };
  useEffect(() => {setDailyHistory(null);}, [storeId, workspaceId]);
  const [externalOpen, setExternalOpen] = useState(false);
  const [externalProducts, setExternalProducts] = useState<StoreProduct[]>([]);
  const [externalSets, setExternalSets] = useState<StoreSet[]>([]);
  const [externalOptionGroups, setExternalOptionGroups] = useState<StoreOptionGroup[]>([]);
  const [externalCart, setExternalCart] = useState<ExternalCartItem[]>([]);
  const [externalSource, setExternalSource] = useState('shopeefood');
  const [externalNumber, setExternalNumber] = useState('');
  const [externalName, setExternalName] = useState('');
  const [externalPhone, setExternalPhone] = useState('');
  const [externalNotes, setExternalNotes] = useState('');
  const [creatingExternal, setCreatingExternal] = useState(false);
  const [externalError, setExternalError] = useState('');
  const externalSubmitInFlightRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasHydratedRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  const todayKey = toMalaysiaDateKey(now);
  const completedQueryDateKey = activeView === 'history' && historyDateBasis === 'completed'
    ? historyDateKey
    : todayKey;

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
          setStorePickupSessions(store?.pickupSessions || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStoreDisplayName('Store unavailable');
          setStoreNameForMessages('');
          setStoreCountry('');
          setStorePickupSessions([]);
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
        setOrders(sortOrdersByDeliverySchedule(nextOrders));
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
    let cancelled = false;
    const { start, end } = getMalaysiaDateRange(completedQueryDateKey);
    setIsCompletedLoading(true);
    if (activeView === 'history' && historyDateBasis === 'completed') setHistoryError('');
    void storeOrderService.getCompletedOrdersForBusinessDate(storeId, workspaceId, start, end)
      .then(nextOrders => {
        if (cancelled) return;
        setCompletedOrders(nextOrders);
        setIsCompletedLoading(false);
      })
      .catch(error => {
        if (cancelled) return;
        setIsCompletedLoading(false);
        const message = error instanceof Error ? error.message : 'Unable to load completed orders.';
        if (activeView === 'history' && historyDateBasis === 'completed') setHistoryError(message);
        else setErrorMessage(message);
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, completedQueryDateKey, historyDateBasis, historyRefreshKey, storeId, workspaceId]);

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

  const [dailyView, setDailyView] = useState<DailyView>('Today');
  const dailyOrders = [...new Map([...(dailyHistory?.orders || []), ...completedOrders, ...orders].map(order => [order.id, order])).values()];
  const boardDailyEntries = dailyView === 'History' ? [] : dailyEntries(dailyOrders,dailyView,todayKey);
  const groupedOrders = useMemo(() => ACTIVE_COLUMNS.reduce<Record<ActivePosStatus, ReturnType<typeof buildGroupKitchenEntries>>>(
    (groups, column) => {
      groups[column.status] = buildGroupKitchenEntries(orders.filter(order => !order.fulfilments?.length && !order.weeklyFulfilments?.length && !getOrderTickets(order).some(ticket => ticket.fulfilmentId) && getOrderTickets(order).some(ticket => ticketInDailyView(ticket.date,dailyView,todayKey)) && dailyView !== 'History'), column.status, storePickupSessions);
      return groups;
    },
    { New: [], Preparing: [], Ready: [] }
  ), [orders, storePickupSessions, todayKey, dailyView]);

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
      if (nextStatus === 'Completed') setHistoryRefreshKey(current => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update this order.');
    } finally {
      setUpdatingOrderId('');
    }
  };

  const openExternalOrder = async () => {
    setErrorMessage('');
    setExternalError('');
    setExternalOpen(true);
    try {
      const [products, optionGroups, sets] = await Promise.all([
        storeService.listAdminProducts(workspaceId),
        storeService.listOptionGroups(workspaceId),
        storeService.listSets(workspaceId)
      ]);
      setExternalProducts(products.filter(product => product.available));
      setExternalOptionGroups(optionGroups);
      setExternalSets(sets.filter(set => set.available && !getStoreSetUnavailableReason(set, products)));
    } catch (error) {
      setExternalError(error instanceof Error ? error.message : 'Unable to load Store products.');
    }
  };

  const createExternalOrder = async () => {
    if (externalSubmitInFlightRef.current || !externalCart.length || creatingExternal) return;
    externalSubmitInFlightRef.current = true;
    setCreatingExternal(true);
    setExternalError('');
    try {
      const paymentLabel = externalSource === 'shopeefood' ? 'shopeefood_platform_paid' : externalSource === 'walk_in' ? 'walk_in_paid' : 'other_paid';
      const result = await storeOrderService.createExternalPosOrder({ workspaceId, storeId, slug: (await storeService.getWorkspaceStore(workspaceId))?.slug || '', source: externalSource, externalOrderNumber: externalNumber, paymentLabel, customerName: externalName, phone: externalPhone, notes: externalNotes, selections: externalCart.map(item => ({ ...item.selection, quantity: item.quantity })) });
      if (externalSource === 'walk_in') {
        try {
          const createdOrder = await storeOrderService.getOrder(result.orderId);
          if (createdOrder && isWalkInOrder(createdOrder) && createdOrder.payment.status === 'paid') printWalkInReceipt(createdOrder);
        } catch {
          // The persisted order remains available for POS-card reprint.
        }
      }
      setExternalOpen(false); setExternalNumber(''); setExternalName(''); setExternalPhone(''); setExternalNotes(''); setExternalCart([]);
    } catch (error) {
      setExternalError(error instanceof Error ? error.message : 'Unable to create external order.');
    } finally {
      externalSubmitInFlightRef.current = false;
      setCreatingExternal(false);
    }
  };
  const addExternalProduct = (product: StoreProduct) => setExternalCart(current => {
    const existing = current.find(item => item.key === `product:${product.id}`);
    return existing ? current.map(item => item === existing ? { ...item, quantity: Math.min(20, item.quantity + 1) } : item) : [...current, { key: `product:${product.id}`, label: product.name, quantity: 1, selection: { productId: product.id, selectedOptions: [] } }];
  });
  const addExternalSet = (set: StoreSet) => setExternalCart(current => {
    const existing = current.find(item => item.key === `set:${set.id}`);
    return existing ? current.map(item => item === existing ? { ...item, quantity: Math.min(20, item.quantity + 1) } : item) : [...current, { key: `set:${set.id}`, label: set.name, quantity: 1, selection: { setId: set.id, selectedOptions: [], selectedSetItems: getDefaultStoreSetSelections(set, externalProducts) } }];
  });
  const updateExternalCartQuantity = (key: string, change: number) => setExternalCart(current => current.flatMap(item => item.key !== key ? [item] : item.quantity + change < 1 ? [] : [{ ...item, quantity: Math.min(20, item.quantity + change) }]));
  const toggleExternalOption = (key: string, group: StoreOptionGroup, optionId: string) => setExternalCart(current => current.map(item => {
    if (item.key !== key) return item;
    const otherGroups = item.selection.selectedOptions.filter(choice => choice.groupId !== group.id);
    const selected = item.selection.selectedOptions.filter(choice => choice.groupId === group.id);
    const next = selected.some(choice => choice.optionId === optionId) ? selected.filter(choice => choice.optionId !== optionId) : group.selectionType === 'single' ? [{ groupId: group.id, optionId }] : [...selected, { groupId: group.id, optionId }];
    return { ...item, selection: { ...item.selection, selectedOptions: [...otherGroups, ...next] } };
  }));
  const hasRequiredExternalOptions = externalCart.every(item => {
    const product = externalProducts.find(candidate => candidate.id === item.selection.productId);
    return !product || product.optionGroupIds.every(groupId => {
      const group = externalOptionGroups.find(candidate => candidate.id === groupId);
      return !group?.required || item.selection.selectedOptions.filter(choice => choice.groupId === groupId).length >= Math.max(1, group.minimumSelections || 1);
    });
  });
  const externalCartLines = externalCart.map(item => {
    const set = externalSets.find(candidate => candidate.id === item.selection.setId);
    const product = externalProducts.find(candidate => candidate.id === item.selection.productId);
    const adjustments = item.selection.selectedOptions.flatMap(choice => {
      const group = externalOptionGroups.find(candidate => candidate.id === choice.groupId && candidate.available);
      const option = group?.options.find(candidate => candidate.id === choice.optionId && candidate.available);
      return option ? [option.priceAdjustment] : [];
    });
    const unitPrice = set
      ? calculateStoreSetAnalysis(set, externalProducts, item.selection.selectedSetItems || []).sellingPrice
      : calculateStoreOptionAdjustedPrice(product?.price || 0, adjustments);
    return { ...item, unitPrice, lineTotal: Math.round((unitPrice * item.quantity + Number.EPSILON) * 100) / 100 };
  });
  const externalSubtotal = Math.round((externalCartLines.reduce((sum, item) => sum + item.lineTotal, 0) + Number.EPSILON) * 100) / 100;

  const advanceGroup = async (entry: Extract<GroupKitchenEntry, { kind: 'group' }>) => {
    if (!entry.batchAction || updatingGroupId || updatingOrderId) return;
    setUpdatingGroupId(entry.groupId);
    setErrorMessage('');
    try {
      await storeOrderService.updateGroupFulfilment(entry.groupId, entry.batchAction);
      if (entry.batchAction === 'complete') setHistoryRefreshKey(current => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update this Group.');
    } finally {
      setUpdatingGroupId('');
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
      <nav aria-label="POS sections" className="sticky top-0 z-30 flex gap-2 border-b bg-white p-3 text-slate-950">
        <button type="button" aria-current={posSection === 'orders' ? 'page' : undefined} onClick={() => setPosSection('orders')} className={`rounded-lg px-5 py-3 font-bold ${posSection === 'orders' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>POS · Live</button>
        <button type="button" aria-current={posSection === 'tickets' ? 'page' : undefined} onClick={() => setPosSection('tickets')} className={`rounded-lg px-5 py-3 font-bold ${posSection === 'tickets' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>Print Tickets</button>
      </nav>
      {posSection === 'tickets' ? (
        <main className="mx-auto w-full max-w-5xl p-3">
          <OrderTicketPanel orders={[...new Map([...(dailyHistory?.orders || []), ...completedOrders, ...orders].map(order => [order.id, order])).values()]} />
          {(!dailyHistory || dailyHistory.hasMore) && <button type="button" className="mt-3 rounded border px-4 py-2 underline" disabled={loadingDailyHistory} onClick={() => void loadDailyHistory()}>{loadingDailyHistory ? 'Loading…' : 'Load older orders for reprint'}</button>}
        </main>
      ) : (
        <>
          {activeView === 'history' && <ManualPosOrders workspaceId={workspaceId} storeId={storeId} />}
          {activeView === 'live' && <DailyFulfilmentQueue view={dailyView} onViewChange={setDailyView} onUpdated={() => setHistoryRefreshKey(value => value + 1)} orders={dailyOrders} />}
        </>
      )}
      <audio ref={audioRef} preload="auto" aria-hidden="true" />

      <div className={posSection === 'tickets' ? 'hidden' : 'contents'}>
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
          {activeView === 'history' && <button type="button" onClick={openExternalOrder} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white">+ Add Order</button>}
          <button type="button" onClick={() => activeView === 'live' ? openHistory() : setActiveView('live')} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-white/15 bg-white/5 text-white' : 'border-slate-300 bg-slate-100 text-slate-900'}`}>{activeView === 'live' ? <History className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}{activeView === 'live' ? 'View Orders' : 'Live Queue'}</button>
          <button type="button" onClick={() => setIsNightMode(current => !current)} aria-pressed={isNightMode} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-blue-400/60 bg-blue-500/10 text-white' : 'border-slate-300 bg-slate-100 text-slate-900'}`}><Moon className="h-5 w-5" /><span>Night Mode</span><span className={`relative h-6 w-11 rounded-full transition-colors ${isNightMode ? 'bg-blue-500' : 'bg-slate-300'}`} aria-hidden="true"><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${isNightMode ? 'translate-x-6' : 'translate-x-1'}`} /></span></button>
          <button type="button" onClick={toggleSound} aria-pressed={soundEnabled} className={`inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-blue-500/40 bg-blue-500/10 text-blue-200' : 'border-blue-300 bg-blue-50 text-blue-800'}`}>{soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}Sound {soundEnabled ? 'On' : 'Off'}</button>
          {notificationAction}
        </div>
      </header>

      {errorMessage && <p role="alert" className="mx-4 mt-3 rounded-xl border border-red-400 bg-red-950 px-5 py-3 text-sm font-black text-red-100 lg:mx-6">{errorMessage}</p>}

      {activeView === 'live' ? (
        <div hidden={dailyView === 'History'} className="flex-1 overflow-x-auto p-3 lg:p-4">
          <h2 className="text-xl font-bold">POS board · {dailyView} fulfilments {dailyView === 'Today' ? `(${todayKey}, Malaysia)` : ''}</h2>
          <p>Counts reflect this fulfilment period, not the parent order status. Future Ready meals are available under Upcoming.</p>
          <p className="mt-2 text-sm text-slate-500">Use the Daily fulfilments tabs above to change the date or view history.</p>
          <div className="grid min-h-full min-w-[1040px] grid-cols-[minmax(0,1fr)_220px] gap-4">
            <div className="grid grid-cols-[1.1fr_1.1fr_0.9fr] gap-4">
              {ACTIVE_COLUMNS.map(column => {
                const Icon = column.icon;
                const columnOrders = groupedOrders[column.status];
                const dailyColumn = boardDailyEntries.filter(entry => toActivePosStatus(entry.status) === column.status);
                return (
                  <section key={column.status} aria-labelledby={`pos-column-${column.status}`} className={`flex min-h-[65vh] flex-col rounded-2xl border border-t-4 ${column.border} ${isNightMode ? 'bg-[#0b1727]/90 text-white' : `${column.tint} text-slate-950`} p-3 shadow-lg`}>
                    <div className="mb-3 flex items-center justify-between gap-3 px-1"><h2 data-status={column.status.toLowerCase()} id={`pos-column-${column.status}`} className="pos-status-heading flex items-center gap-2 text-xl font-black tracking-tight"><Icon className="h-6 w-6" /> {column.label}</h2><span className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-base font-black ${column.badge}`}>{columnOrders.length + dailyColumn.length}</span></div>
                    <div className="flex-1 space-y-3">
                      {dailyColumn.map(({order,ticket}) => <div key={ticket.key}><DailyFulfilmentCard order={order} ticket={ticket} onUpdated={()=>setHistoryRefreshKey(value=>value+1)} /></div>)}
                      {columnOrders.map(entry => entry.kind === 'group' ? (
                        <article key={entry.key} data-group-order-id={entry.groupId} className={`pos-light-surface rounded-2xl border-2 p-4 shadow-md ${isNightMode ? 'border-blue-500/60 bg-[#081321]' : 'border-blue-300 bg-white'}`}>
                          <div className="flex items-start justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${column.badge}`}>Group Order · {column.label}</span><span className={`text-sm font-black ${isNightMode ? 'text-blue-200' : 'text-blue-800'}`}>{entry.memberCount} members</span></div>
                          <h3 className={`pos-card-title mt-4 text-2xl font-black leading-none ${isNightMode ? 'text-white' : 'text-slate-950'}`}>{entry.groupName}</h3>
                          <p className={`mt-2 text-sm font-extrabold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>Host: {entry.hostName}</p>
                          <div className={`mt-3 rounded-xl px-3 py-3 ${isNightMode ? 'bg-blue-500/10 text-blue-100' : 'bg-blue-50 text-blue-950'}`}><p className="text-xs font-black uppercase tracking-wide">Group Pickup</p><p className="mt-1 text-base font-black">{formatMalaysiaBusinessDate(entry.pickupDate)} · {entry.pickupSession}</p><p className="mt-1 text-sm font-extrabold">{entry.pickupLocationName}</p></div>
                          <p className={`mt-3 text-sm font-black ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{entry.paidOrderCount} paid · {entry.eligibleOrderCount} eligible</p>
                          <div className={`mt-4 space-y-4 border-t pt-4 ${isNightMode ? 'border-slate-700' : 'border-slate-200'}`}>
                            {entry.members.map(member => {
                              const order = member.order;
                              return <section key={order.id} data-store-order-id={order.id} className={`rounded-xl border p-3 ${isNightMode ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div><h4 className="text-base font-black">{member.position} / {member.total} — {order.customerName}</h4><p className={`mt-1 text-xs font-black ${paymentClass(order)}`}>{paymentStatusLabel(order.payment.status)} · {order.fulfilmentStatus || 'New'}</p></div><span className={`text-xs font-black ${isNightMode ? 'text-slate-300' : 'text-slate-600'}`}>{order.orderNumber}</span></div><ul className="mt-3 space-y-2">{order.items.map((item, index) => <li key={`${order.id}-${item.productId}-${index}`} className="flex gap-2 text-base font-black leading-tight"><span className="min-w-7 text-right">{item.quantity}×</span><div>{item.productName}<HealthyLunchPurchasedOptions item={item} />{item.setSnapshot && <span className={`mt-1 block text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.setSnapshot.selectedGroups.map(selection => formatStoreOrderSetSelection(selection, storeCountry === 'SG' ? 'SGD' : 'MYR')).join(' · ')}</span>}{item.selectedOptions.length > 0 && <span className={`mt-1 block text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.selectedOptions.map(option => `${option.groupName}: ${option.optionName}`).join(' · ')}</span>}</div></li>)}</ul>{order.notes && <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-extrabold text-amber-950">Remark: {order.notes}</p>}{member.actionable && <>{storeCountry && <WhatsAppCustomerButton order={order} country={storeCountry} storeName={storeNameForMessages} className="mt-2 w-full" />}<button type="button" disabled={Boolean(updatingOrderId || updatingGroupId)} onClick={() => openCancellation(order)} className={`mt-2 min-h-11 w-full rounded-xl border px-3 text-sm font-black ${isNightMode ? 'border-rose-400/50 text-rose-200' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>Cancel Order</button></>}</section>;
                            })}
                          </div>
                          {entry.batchAction ? <button type="button" disabled={Boolean(updatingGroupId || updatingOrderId)} onClick={() => void advanceGroup(entry)} className={`mt-4 min-h-14 w-full rounded-xl px-4 text-lg font-black shadow-md active:scale-[0.98] disabled:opacity-50 ${column.action}`}>{updatingGroupId === entry.groupId ? 'Updating Group…' : entry.batchAction === 'start_preparing' ? 'Start Preparing Group' : entry.batchAction === 'mark_ready' ? 'Mark Group Ready' : 'Complete Group'}</button> : entry.awaitingPaymentCount > 0 ? <p className={`mt-4 rounded-xl px-4 py-3 text-center text-sm font-black ${isNightMode ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-900'}`}>Awaiting payment</p> : null}
                        </article>
                      ) : (() => {
                        const order = entry.order;
                        return <article key={entry.key} className={`pos-light-surface rounded-2xl border-2 p-4 shadow-md ${isNightMode ? 'border-slate-700 bg-[#081321]' : 'border-slate-300 bg-white'}`}><div className="flex items-start justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${column.badge}`}>{column.label}</span><time className={`shrink-0 text-sm font-black ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`} dateTime={order.createdAt}>{formatRelativeTime(order.createdAt, now)}</time></div><h3 className={`pos-card-title mt-4 text-2xl font-black leading-none ${isNightMode ? 'text-white' : 'text-slate-950'}`}>{order.orderNumber}</h3>{order.pickupCode && <p className={`mt-2 inline-flex rounded-lg px-3 py-1.5 text-xl font-black tracking-[0.18em] ${isNightMode ? 'bg-blue-400 text-slate-950' : 'bg-blue-100 text-blue-950'}`}><span className="sr-only">Pickup Code </span>{order.pickupCode}</p>}<p className={`mt-3 text-sm font-extrabold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}><span className="capitalize">{getPosSourceLabel(order)}</span><span className="px-1.5">·</span><span className={paymentClass(order)}>{paymentStatusLabel(order.payment.status)}</span></p><ul className={`mt-4 space-y-3 border-t pt-4 ${isNightMode ? 'border-slate-700' : 'border-slate-200'}`}>{order.items.map((item, index) => <li key={`${order.id}-${item.productId}-${index}`} className={`flex gap-2 text-lg font-black leading-tight ${isNightMode ? 'text-white' : 'text-slate-950'}`}><span className={`min-w-8 text-right ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.quantity}×</span><div>{item.productName}<HealthyLunchPurchasedOptions item={item} />{item.setSnapshot ? <span className={`mt-1 block text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.setSnapshot.selectedGroups.map(selection => formatStoreOrderSetSelection(selection, storeCountry === 'SG' ? 'SGD' : 'MYR')).join(' · ')}</span> : item.selectedOptions.length > 0 && <span className={`mt-1 block text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.selectedOptions.map(option => option.optionName).join(', ')}</span>}</div></li>)}</ul>{order.notes && <p className="mt-4 rounded-xl bg-amber-100 px-3 py-2 text-sm font-extrabold text-amber-950">Note: {order.notes}</p>}<button type="button" disabled={Boolean(updatingOrderId)} onClick={() => void advanceOrder(order)} className={`mt-5 min-h-14 w-full rounded-xl px-4 text-lg font-black shadow-md active:scale-[0.98] disabled:opacity-50 ${column.action}`}>{updatingOrderId === order.id ? 'Updating…' : column.actionLabel}</button>{column.status === 'New' && order.payment.status === 'paid' && <button disabled={Boolean(updatingOrderId)} className="mt-2 min-h-12 w-full rounded-xl bg-emerald-600 p-3 font-bold text-white" onClick={async()=>{setUpdatingOrderId(order.id);try{await storeOrderService.updateFulfilment(order.id,'Ready');}catch(error){setErrorMessage(error instanceof Error?error.message:'Unable to mark ready.');}finally{setUpdatingOrderId('');}}}>Mark Ready</button>}{isWalkInOrder(order) && order.payment.status === "paid" && <button type="button" onClick={() => printWalkInReceipt(order)} className="mt-2 min-h-12 w-full rounded-xl border px-4 text-sm font-black">Print Receipt</button>}{storeCountry && <WhatsAppCustomerButton order={order} country={storeCountry} storeName={storeNameForMessages} className="mt-2 w-full" />}<button type="button" disabled={Boolean(updatingOrderId)} onClick={() => openCancellation(order)} className={`mt-2 min-h-12 w-full rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-rose-400/50 text-rose-200' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>Cancel Order</button></article>;
                      })())}
                      {!isLoading && columnOrders.length === 0 && dailyColumn.length === 0 && <p className={`px-4 py-4 text-center text-sm font-extrabold ${isNightMode ? 'text-slate-300' : 'text-slate-600'}`}>No orders</p>}
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
              return <article key={order.id} className={`rounded-2xl border-2 p-4 ${isCancelled ? isNightMode ? 'border-rose-800 bg-rose-950/40' : 'border-rose-200 bg-rose-50' : isNightMode ? 'border-slate-700 bg-[#081321]' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${isCancelled ? 'bg-rose-600 text-white' : isCompleted ? 'bg-slate-600 text-white' : 'bg-blue-600 text-white'}`}>{order.fulfilmentStatus || 'Order'}</span><time className={`text-xs font-black ${isNightMode ? 'text-slate-200' : 'text-slate-600'}`}>{historyDateBasis === 'completed' ? 'Completed' : 'Created'} {formatMalaysiaTimestamp(historyTimestamp)}</time></div><h3 className="pos-readable-heading mt-3 text-xl font-black">{order.orderNumber}</h3>{order.pickupCode && <p className={`mt-2 text-sm font-black tracking-[0.16em] ${isNightMode ? 'text-blue-200' : 'text-blue-800'}`}>Pickup {order.pickupCode}</p>}<p className={`mt-2 text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}><span className="capitalize">{order.orderSource}</span> · <span className={paymentClass(order)}>{paymentStatusLabel(order.payment.status)}</span></p><ul className={`mt-3 space-y-2 border-t pt-3 ${isNightMode ? 'border-slate-700' : 'border-slate-200'}`}>{order.items.map((item, index) => <li key={`${order.id}-history-${index}`} className="font-black">{item.quantity}× {item.productName}<HealthyLunchPurchasedOptions item={item} />{item.setSnapshot ? <span className={`block pl-5 text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.setSnapshot.selectedGroups.map(selection => formatStoreOrderSetSelection(selection, storeCountry === 'SG' ? 'SGD' : 'MYR')).join(' · ')}</span> : item.selectedOptions.length > 0 && <span className={`block pl-5 text-sm font-bold ${isNightMode ? 'text-slate-200' : 'text-slate-700'}`}>{item.selectedOptions.map(option => option.optionName).join(', ')}</span>}</li>)}</ul>{order.notes && <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-950">Note: {order.notes}</p>}{isCancelled && <div className={`mt-3 rounded-xl px-3 py-3 text-sm ${isNightMode ? 'bg-rose-950 text-rose-100' : 'bg-rose-100 text-rose-950'}`}><p className="font-black">Cancellation reason</p><p className="mt-1 font-bold">{order.cancellationReason || 'Not recorded'}</p><p className="mt-2 text-xs font-bold">Cancelled {formatMalaysiaTimestamp(order.cancelledAt)}</p></div>}{canCancel && <button type="button" onClick={() => openCancellation(order)} className={`mt-4 min-h-12 w-full rounded-xl border px-4 text-sm font-black ${isNightMode ? 'border-rose-400/50 text-rose-200' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>Cancel Order</button>}</article>;
            })}</div>}
          </section>
        </div>
      )}

      <footer className={`pos-light-surface mx-3 mb-3 grid gap-2 rounded-xl border px-4 py-2 sm:grid-cols-3 lg:mx-4 ${isNightMode ? 'border-slate-700 bg-[#0b1727] text-white' : 'border-slate-300 bg-white text-slate-950'}`}><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /><span><span className="block text-[10px] font-bold text-slate-400">Last Updated</span><span className="text-xs font-black">{lastUpdated ? lastUpdated.toLocaleTimeString() : 'Connecting…'}</span></span></div><div className="flex items-center gap-2"><Store className="h-5 w-5 text-slate-400" /><span><span className="block text-[10px] font-bold text-slate-400">Store</span><span className="text-xs font-black">{storeDisplayName}</span></span></div><div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-emerald-500" /><span><span className="block text-[10px] font-bold text-slate-400">Active Online Orders</span><span className="text-xs font-black">{activeOnlineOrderCount}</span></span></div></footer>

      {cancelOrder && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="cancel-order-title" className={`pos-light-surface w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${isNightMode ? 'border-slate-600 bg-[#0b1727] text-white' : 'border-slate-300 bg-white text-slate-950'}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-rose-500">Preserves order record</p><h2 id="cancel-order-title" className="pos-readable-heading mt-1 text-2xl font-black">Cancel Order</h2><p className="mt-1 text-lg font-black">{cancelOrder.orderNumber}</p></div><button type="button" onClick={closeCancellation} aria-label="Close cancellation dialog" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-400"><X className="h-5 w-5" /></button></div><p className={`mt-4 rounded-xl px-4 py-3 text-sm font-bold ${isNightMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>This removes the order from the active kitchen queue but preserves it in Order History.</p>{cancelOrder.payment.status === 'paid' && <p className="mt-3 flex gap-2 rounded-xl border border-amber-400 bg-amber-100 px-4 py-3 text-sm font-black text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" />Canceling this order does not refund the payment.</p>}<fieldset className="mt-5"><legend className="text-sm font-black">Cancellation reason</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{CANCELLATION_REASONS.map(reason => <label key={reason} className={`pos-control flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-bold ${cancellationChoice === reason ? 'border-rose-500 bg-rose-50 text-rose-900' : isNightMode ? 'border-slate-600 bg-slate-900' : 'border-slate-300 bg-white'}`}><input type="radio" name="cancellation-reason" value={reason} checked={cancellationChoice === reason} onChange={() => setCancellationChoice(reason)} />{reason}</label>)}</div></fieldset>{cancellationChoice === 'Other' && <label className="mt-3 block text-sm font-black">Explain the reason<textarea autoFocus maxLength={233} value={otherCancellationReason} onChange={event => setOtherCancellationReason(event.target.value)} className="pos-control mt-2 min-h-24 w-full rounded-xl border border-slate-400 bg-white p-3 text-sm font-bold text-slate-950" placeholder="Required" /></label>}<div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={closeCancellation} disabled={Boolean(updatingOrderId)} className={`min-h-12 rounded-xl border px-4 font-black ${isNightMode ? 'border-slate-600 text-white' : 'border-slate-300 text-slate-800'}`}>Keep Order</button><button type="button" onClick={() => void confirmCancellation()} disabled={!canConfirmCancellation || Boolean(updatingOrderId)} className="min-h-12 rounded-xl bg-rose-600 px-4 font-black text-white disabled:opacity-40">{updatingOrderId ? 'Cancelling…' : 'Confirm Cancellation'}</button></div></section></div>}
      {externalOpen && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/65 p-3 sm:p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="pos-order-entry-title" className="flex h-[92dvh] max-h-[900px] w-full md:w-[90vw] max-w-[1440px] flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 id="pos-order-entry-title" className="text-xl font-black">Add Order</h2>
                <p className="text-xs font-bold text-slate-500">{externalSource === 'shopeefood' ? 'ShopeeFood · Platform Paid' : externalSource === 'walk_in' ? 'Walk-in · Paid' : 'Other · Paid'}</p>
              </div>
              <button type="button" onClick={() => setExternalOpen(false)} disabled={creatingExternal} aria-label="Close" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40"><X /></button>
            </header>

            <fieldset disabled={creatingExternal} className="grid shrink-0 grid-cols-2 gap-3 border-b px-4 py-3 disabled:opacity-60">
              <label className="text-xs font-bold text-slate-600">Source
                <select value={externalSource} onChange={event => setExternalSource(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950">
                  <option value="shopeefood">ShopeeFood</option><option value="walk_in">Walk-in</option><option value="other">Other</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">External order number (optional)
                <input value={externalNumber} onChange={event => setExternalNumber(event.target.value)} placeholder="External order number (optional)" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950" />
              </label>
            </fieldset>

            <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
            <div role="region" aria-label="Store products" className="min-h-0 flex-1 overflow-y-auto p-4">
              <h3 className="mb-3 text-sm font-black">Products</h3>
              <div className="grid grid-cols-2 items-start gap-3 xl:grid-cols-3">
                {externalProducts.map(product => (
                  <article key={product.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="aspect-[16/9] bg-slate-100">{product.photoUrl ? <img src={product.photoUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">No image</div>}</div>
                    <div className="space-y-2 p-3">
                      <p className="text-sm font-black">{product.name}</p>
                      <p className="text-sm font-bold text-slate-600">MYR {product.price.toFixed(2)}</p>
                      <button type="button" onClick={() => addExternalProduct(product)} disabled={creatingExternal} className="w-full rounded-lg bg-blue-50 px-3 py-2 text-sm font-black text-blue-800 hover:bg-blue-100 disabled:opacity-40">Add</button>
                    </div>
                  </article>
                ))}
              </div>
              {externalSets.length > 0 && <div className="mt-4 border-t pt-3">
                <p className="mb-2 text-sm font-black">Sets</p>
                <div className="grid gap-2 sm:grid-cols-2">{externalSets.map(set => <button key={set.id} type="button" onClick={() => addExternalSet(set)} disabled={creatingExternal} className="rounded-xl border border-violet-300 bg-violet-50 p-3 text-left disabled:opacity-40"><span className="block font-black">Set · {set.name}</span><span className="text-sm font-bold text-slate-600">MYR {set.price.toFixed(2)} · Add</span></button>)}</div>
              </div>}
            </div>

            <div className="flex min-h-0 shrink-0 flex-col border-t bg-slate-50 md:border-l md:border-t-0">
            <section aria-label="Order cart" className="min-h-0 overflow-y-auto px-4 py-3 md:flex-1">
              <h3 className="mb-2 text-sm font-black">Cart</h3>
              <div className="max-h-[20dvh] space-y-2 overflow-y-auto md:max-h-none md:overflow-visible">
                {externalCartLines.length === 0 && <p className="py-2 text-sm text-slate-500">Cart is empty</p>}
                {externalCartLines.map(item => <div key={item.key} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1"><p className="text-sm font-bold">{item.label}</p><p className="text-xs text-slate-500">MYR {item.unitPrice.toFixed(2)} each</p></div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateExternalCartQuantity(item.key, -1)} disabled={creatingExternal} aria-label={`Decrease ${item.label} quantity`} className="h-8 w-8 rounded-lg border border-slate-300 font-black disabled:opacity-40">−</button>
                      <span aria-label={`${item.label} quantity`} className="min-w-5 text-center text-sm font-black">{item.quantity}</span>
                      <button type="button" onClick={() => updateExternalCartQuantity(item.key, 1)} disabled={creatingExternal || item.quantity >= 20} aria-label={`Increase ${item.label} quantity`} className="h-8 w-8 rounded-lg border border-slate-300 font-black disabled:opacity-40">+</button>
                    </div>
                    <span className="min-w-20 text-right text-sm font-black">MYR {item.lineTotal.toFixed(2)}</span>
                  </div>
                  {item.selection.productId && externalProducts.find(product => product.id === item.selection.productId)?.optionGroupIds.map(groupId => {
                    const group = externalOptionGroups.find(candidate => candidate.id === groupId);
                    return group && <fieldset key={group.id} disabled={creatingExternal} className="mt-2 border-t pt-2 text-xs disabled:opacity-60"><legend className="font-bold">{group.name}{group.required ? ' (required)' : ''}</legend><div className="flex flex-wrap gap-3">{group.options.filter(option => option.available).map(option => <label key={option.id} className="flex items-center gap-1"><input type={group.selectionType === 'single' ? 'radio' : 'checkbox'} name={`${item.key}-${group.id}`} checked={item.selection.selectedOptions.some(choice => choice.groupId === group.id && choice.optionId === option.id)} onChange={() => toggleExternalOption(item.key, group, option.id)} />{option.name}</label>)}</div></fieldset>;
                  })}
                </div>)}
              </div>
              <fieldset disabled={creatingExternal} className="mt-3 grid grid-cols-2 gap-2 disabled:opacity-60">
                <label className="text-xs font-bold text-slate-600">Customer name{externalSource === 'walk_in' ? ' (optional)' : ' (required)'}
                  <input value={externalName} onChange={event => setExternalName(event.target.value)} placeholder="Customer name (optional for Walk-in)" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950" />
                </label>
                <label className="text-xs font-bold text-slate-600">Phone{externalSource === 'walk_in' ? ' (optional)' : ' (required)'}
                  <input type="tel" value={externalPhone} onChange={event => setExternalPhone(event.target.value)} placeholder="Phone (optional for Walk-in)" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950" />
                </label>
                <label className="col-span-2 text-xs font-bold text-slate-600">Notes (optional)
                  <textarea rows={1} value={externalNotes} onChange={event => setExternalNotes(event.target.value)} placeholder="Notes (optional)" className="mt-1 block w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950" />
                </label>
              </fieldset>
            </section>

            <footer className="shrink-0 border-t bg-white px-4 py-3">
              <div className="mb-2 flex justify-between text-base font-black"><span>Subtotal</span><span>MYR {externalSubtotal.toFixed(2)}</span></div>
              {!hasRequiredExternalOptions && <p className="mb-2 text-sm text-amber-800">Choose the required product options to continue.</p>}
              {externalSource !== 'walk_in' && (!externalName || !externalPhone) && <p className="mb-2 text-sm text-slate-600">Customer name and phone are required for this source.</p>}
              {externalError && <p id="pos-order-entry-error" role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{externalError}</p>}
              <button type="button" onClick={() => void createExternalOrder()} disabled={creatingExternal || !externalCart.length || !hasRequiredExternalOptions || (externalSource !== 'walk_in' && (!externalName || !externalPhone))} aria-busy={creatingExternal} aria-describedby={externalError ? 'pos-order-entry-error' : undefined} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-base font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                {creatingExternal && <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />}{creatingExternal ? 'Creating…' : 'Confirm Order'}
              </button>
            </footer>
            </div>
            </div>
          </section>
        </div>
      )}
      </div>
    </section>
  );
}
