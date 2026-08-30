import { HttpsError } from 'firebase-functions/v2/https';

const readString = value => typeof value === 'string' ? value.trim() : '';
const readNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const toIso = value => value?.toDate instanceof Function
  ? value.toDate().toISOString()
  : readString(value);

const customerOrderItem = value => {
  const item = value && typeof value === 'object' ? value : {};
  const productName = readString(item.setSnapshot?.setName) || readString(item.productName);
  const quantity = Math.max(0, readNumber(item.quantity));
  if (!productName || quantity < 1) return null;
  return {
    productName,
    quantity,
    setSelections: (Array.isArray(item.setSnapshot?.selectedGroups) ? item.setSnapshot.selectedGroups : [])
      .map(selection => ({
        groupName: readString(selection?.groupName),
        productName: readString(selection?.productName)
      }))
      .filter(selection => selection.productName),
    selectedOptions: (Array.isArray(item.selectedOptions) ? item.selectedOptions : [])
      .map(option => ({
        groupName: readString(option?.groupName),
        optionName: readString(option?.optionName)
      }))
      .filter(option => option.optionName)
  };
};

const customerOrder = document => {
  const data = document.data() || {};
  return {
    orderNumber: readString(data.orderNumber),
    orderDate: toIso(data.createdAt),
    storeName: readString(data.storeName) || 'Store',
    itemCount: Math.max(0, readNumber(data.itemCount)),
    items: (Array.isArray(data.items) ? data.items : []).map(customerOrderItem).filter(Boolean),
    remarks: readString(data.notes),
    total: Math.max(0, readNumber(data.total)),
    currency: data.currency === 'SGD' ? 'SGD' : 'MYR',
    paymentStatus: readString(data.payment?.status) || 'pending',
    orderStatus: readString(data.status) || 'Awaiting Payment',
    fulfilmentStatus: readString(data.fulfilmentStatus) || 'New',
    ...(readString(data.groupOrder?.name) ? { groupName: readString(data.groupOrder.name) } : {})
  };
};

export const listCustomerOrders = async ({ db, uid }) => {
  const customerUid = readString(uid);
  if (!customerUid) throw new HttpsError('unauthenticated', 'Sign in to view your orders.');
  const snapshot = await db.collection('storeOrders')
    .where('customerUid', '==', customerUid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return { orders: snapshot.docs.map(customerOrder) };
};
