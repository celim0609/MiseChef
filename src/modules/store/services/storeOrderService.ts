import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getBlob, ref } from 'firebase/storage';
import { db, functions, storage } from '../../../firebase';
import type {
  StoreFulfilmentStatus,
  StoreNotification,
  StoreOrder,
  StoreOrderItem,
  StoreOrderTimelineEvent
} from '../types';

const readString = (value: unknown, fallback = '') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

const readNumber = (value: unknown) => (
  Number.isFinite(Number(value)) ? Number(value) : 0
);

const readTimestamp = (value: unknown) => {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const timestamp = value as { toDate?: () => Date };
    return timestamp.toDate instanceof Function ? timestamp.toDate().toISOString() : '';
  }
  return readString(value);
};

const normalizeOrderItem = (value: unknown): StoreOrderItem => {
  const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    productId: readString(item.productId),
    productName: readString(item.productName, 'Product'),
    photoUrl: readString(item.photoUrl),
    quantity: Math.max(1, Math.round(readNumber(item.quantity))),
    basePrice: readNumber(item.basePrice),
    unitPrice: readNumber(item.unitPrice),
    lineTotal: readNumber(item.lineTotal),
    selectedOptions: Array.isArray(item.selectedOptions)
      ? item.selectedOptions.map(optionValue => {
        const option = optionValue && typeof optionValue === 'object'
          ? optionValue as Record<string, unknown>
          : {};
        return {
          groupId: readString(option.groupId),
          groupName: readString(option.groupName, 'Options'),
          optionId: readString(option.optionId),
          optionName: readString(option.optionName, 'Option'),
          priceAdjustment: readNumber(option.priceAdjustment)
        };
      })
      : []
  };
};

const normalizeOrder = (snapshot: QueryDocumentSnapshot<DocumentData>): StoreOrder => {
  const data = snapshot.data() as Record<string, unknown>;
  const payment = data.payment && typeof data.payment === 'object'
    ? data.payment as Record<string, unknown>
    : {};
  const fulfilmentStatus = readString(data.fulfilmentStatus);
  return {
    id: snapshot.id,
    orderNumber: readString(data.orderNumber, snapshot.id),
    storeId: readString(data.storeId),
    workspaceId: readString(data.workspaceId),
    storeName: readString(data.storeName, 'Store'),
    currency: data.currency === 'MYR' ? 'MYR' : 'SGD',
    paymentMethodId: readString(data.paymentMethodId, 'online'),
    paymentMethodName: readString(data.paymentMethodName, 'Secure online payment'),
    customerName: readString(data.customerName, 'Customer'),
    phone: readString(data.phone),
    pickupDate: readString(data.pickupDate),
    pickupSession: readString(data.pickupSession),
    pickupLocationId: readString(data.pickupLocationId),
    pickupLocationName: readString(data.pickupLocationName),
    pickupLocationAddress: readString(data.pickupLocationAddress),
    pickupLocationNotes: readString(data.pickupLocationNotes),
    notes: readString(data.notes),
    items: Array.isArray(data.items) ? data.items.map(normalizeOrderItem) : [],
    itemCount: readNumber(data.itemCount),
    total: readNumber(data.total),
    fulfilmentStatus: (
      ['Confirmed', 'Paid', 'Preparing', 'Ready', 'Completed', 'Cancelled'].includes(fulfilmentStatus)
        ? fulfilmentStatus
        : ''
    ) as StoreOrder['fulfilmentStatus'],
    fulfilmentUpdatedAt: readTimestamp(data.fulfilmentUpdatedAt),
    fulfilmentUpdatedBy: readString(data.fulfilmentUpdatedBy),
    status: readString(data.status, 'Awaiting Payment') as StoreOrder['status'],
    payment: {
      provider: readString(payment.provider, 'stripe'),
      providerMode: readString(payment.providerMode, 'single_merchant') as StoreOrder['payment']['providerMode'],
      status: readString(payment.status, 'pending') as StoreOrder['payment']['status'],
      amountMinor: readNumber(payment.amountMinor),
      currency: payment.currency === 'MYR' ? 'MYR' : 'SGD',
      providerPaymentId: readString(payment.providerPaymentId),
      providerPaymentMethod: readString(payment.providerPaymentMethod),
      checkoutAccessTokenHash: '',
      failureCode: readString(payment.failureCode),
      refundStatus: readString(payment.refundStatus, 'none') as StoreOrder['payment']['refundStatus'],
      refundedAmountMinor: readNumber(payment.refundedAmountMinor),
      refundFailureCode: readString(payment.refundFailureCode),
      receiptPath: readString(payment.receiptPath),
      receiptFileName: readString(payment.receiptFileName),
      receiptUploadedAt: readTimestamp(payment.receiptUploadedAt),
      reviewedAt: readTimestamp(payment.reviewedAt),
      reviewedBy: readString(payment.reviewedBy),
      createdAt: readTimestamp(payment.createdAt),
      updatedAt: readTimestamp(payment.updatedAt)
    },
    createdAt: readTimestamp(data.createdAt),
    updatedAt: readTimestamp(data.updatedAt)
  };
};

const subscribe = <T,>({
  collectionName,
  field,
  value,
  normalize,
  onData,
  onError
}: {
  collectionName: string;
  field: string;
  value: string;
  normalize: (snapshot: QueryDocumentSnapshot<DocumentData>) => T;
  onData: (items: T[]) => void;
  onError: (error: Error) => void;
}): Unsubscribe => {
  if (!db || !value) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    query(collection(db, collectionName), where(field, '==', value)),
    snapshot => onData(snapshot.docs.map(normalize)),
    error => onError(error)
  );
};

export const storeOrderService = {
  subscribeOrders(
    workspaceId: string,
    onData: (orders: StoreOrder[]) => void,
    onError: (error: Error) => void
  ) {
    return subscribe({
      collectionName: 'storeOrders',
      field: 'workspaceId',
      value: workspaceId,
      normalize: normalizeOrder,
      onData: orders => onData(
        orders
          .filter(order => Boolean(order.fulfilmentStatus)
            || ['pending_verification', 'rejected'].includes(order.payment.status))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      ),
      onError
    });
  },

  subscribeTimeline(
    workspaceId: string,
    orderId: string,
    onData: (events: StoreOrderTimelineEvent[]) => void,
    onError: (error: Error) => void
  ) {
    if (!db || !workspaceId || !orderId) {
      onData([]);
      return () => undefined;
    }
    return onSnapshot(
      query(
        collection(db, 'storeOrderTimeline'),
        where('workspaceId', '==', workspaceId),
        where('orderId', '==', orderId)
      ),
      snapshot => onData(snapshot.docs.map((documentSnapshot): StoreOrderTimelineEvent => {
        const data = documentSnapshot.data() as Record<string, unknown>;
        return {
          id: documentSnapshot.id,
          orderId: readString(data.orderId),
          workspaceId: readString(data.workspaceId),
          storeId: readString(data.storeId),
          type: data.type === 'payment_received' ? 'payment_received' : data.type === 'payment_review' ? 'payment_review' : 'fulfilment_status',
          label: readString(data.label),
          previousStatus: readString(data.previousStatus),
          newStatus: readString(data.newStatus, 'Paid') as StoreOrderTimelineEvent['newStatus'],
          actingUserId: readString(data.actingUserId),
          createdAt: readTimestamp(data.createdAt)
        };
      }).sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
      error => onError(error)
    );
  },

  subscribeNotifications(
    workspaceId: string,
    onData: (notifications: StoreNotification[]) => void,
    onError: (error: Error) => void
  ) {
    return subscribe({
      collectionName: 'storeNotifications',
      field: 'workspaceId',
      value: workspaceId,
      normalize: (snapshot): StoreNotification => {
        const data = snapshot.data() as Record<string, unknown>;
        return {
          id: snapshot.id,
          workspaceId: readString(data.workspaceId),
          storeId: readString(data.storeId),
          orderId: readString(data.orderId),
          orderNumber: readString(data.orderNumber),
          type: data.type === 'payment_verification_required' ? 'payment_verification_required' : 'new_paid_order',
          title: readString(data.title, 'New paid order'),
          message: readString(data.message),
          readAt: readTimestamp(data.readAt),
          createdAt: readTimestamp(data.createdAt)
        };
      },
      onData: notifications => onData(
        notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      ),
      onError
    });
  },

  async markNotificationRead(notificationId: string) {
    if (!db || !notificationId) return;
    await updateDoc(doc(db, 'storeNotifications', notificationId), {
      readAt: serverTimestamp()
    });
  },

  async updateFulfilment(orderId: string, nextStatus: StoreFulfilmentStatus) {
    if (!functions) throw new Error('Order updates are temporarily unavailable.');
    const updateStatus = httpsCallable<
      { orderId: string; nextStatus: StoreFulfilmentStatus },
      { orderId: string; previousStatus: string; fulfilmentStatus: StoreFulfilmentStatus }
    >(functions, 'updateStoreOrderStatus');
    return (await updateStatus({ orderId, nextStatus })).data;
  },

  async reviewManualPayment(orderId: string, decision: 'approve' | 'reject') {
    if (!functions) throw new Error('Payment review is temporarily unavailable.');
    const review = httpsCallable(functions, 'reviewStoreManualPayment');
    await review({ orderId, decision });
  },

  async openReceipt(receiptPath: string) {
    if (!storage || !receiptPath) throw new Error('No receipt is available.');
    const blob = await getBlob(ref(storage, receiptPath));
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
};
