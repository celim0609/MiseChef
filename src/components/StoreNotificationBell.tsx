import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  ReceiptText,
  XCircle
} from 'lucide-react';
import type { StoreNotification } from '../modules/store';

interface StoreNotificationBellProps {
  notifications: StoreNotification[];
  onSelect: (notification: StoreNotification) => void;
}

const notificationIcon = (type: StoreNotification['type']) => {
  const className = 'h-4 w-4';
  if (type === 'payment_submitted') return <ReceiptText className={className} aria-hidden="true" />;
  if (type === 'payment_approved') return <CheckCircle2 className={className} aria-hidden="true" />;
  if (type === 'payment_rejected') return <XCircle className={className} aria-hidden="true" />;
  if (type === 'order_ready') return <PackageCheck className={className} aria-hidden="true" />;
  return <ClipboardCheck className={className} aria-hidden="true" />;
};

export default function StoreNotificationBell({
  notifications,
  onSelect
}: StoreNotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = notifications.filter(notification => !notification.readAt).length;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={unreadCount > 0 ? `${unreadCount} unread Store notifications` : 'Store notifications'}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(current => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-surface-container-high bg-white text-primary shadow-sm transition-colors hover:bg-surface-container-low"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-[10px] font-extrabold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section role="menu" aria-label="Store notifications" className="fixed inset-x-3 top-16 z-[90] max-h-[70vh] overflow-hidden rounded-3xl border border-surface-container-high bg-white shadow-2xl shadow-primary/15 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-surface-container-high px-4 py-3">
            <div>
              <p className="font-display text-lg font-bold text-primary">Notifications</p>
              <p className="font-sans text-[11px] font-bold text-on-surface-variant">Live updates for this Workspace</p>
            </div>
            {unreadCount > 0 && <span className="rounded-full bg-primary/10 px-2.5 py-1 font-sans text-[10px] font-extrabold text-primary">{unreadCount} unread</span>}
          </div>
          <div className="max-h-[58vh] overflow-y-auto p-2">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center font-sans text-sm font-bold text-on-surface-variant">You’re all caught up.</p>
            ) : notifications.slice(0, 30).map(notification => (
              <button
                key={notification.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onSelect(notification);
                }}
                className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${notification.readAt ? 'hover:bg-surface-container-low' : 'bg-primary/5 hover:bg-primary/10'}`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${notification.readAt ? 'bg-surface-container text-primary' : 'bg-primary text-on-primary'}`}>
                  {notificationIcon(notification.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-sans text-sm font-extrabold text-primary">{notification.title}</span>
                    {!notification.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-error" aria-label="Unread" />}
                  </span>
                  <span className="mt-0.5 block font-sans text-xs font-bold leading-relaxed text-on-surface-variant">{notification.message}</span>
                  <span className="mt-1 block font-sans text-[10px] font-extrabold uppercase tracking-wider text-outline">{notification.orderNumber}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
