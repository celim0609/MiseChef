import { PAYMENT_STATUS, readString } from '../storePaymentsCore.js';
import { CurlecOrderCreationError, CurlecPaymentLookupError } from './curlecStandardCheckout.js';

export const CURLEC_PAYMENT_LINK_MODE = 'payment_link';
const API_URL = 'https://api.razorpay.com/v1/payment_links';
const authorizationHeader = (keyId, keySecret) => `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
const paymentLinkReferenceId = order => `mc_${readString(order.id)}`;
const normalizeCurlecContact = phone => {
  const contact = readString(phone);
  if (/^\+60\d+$/.test(contact)) return contact;
  if (/^60\d+$/.test(contact)) return `+${contact}`;
  if (/^0\d+$/.test(contact)) return `+60${contact.slice(1)}`;
  return contact;
};
const paymentLinkCallbackUrl = ({ returnUrl, checkoutAccessToken }) => {
  const url = new URL(returnUrl);
  // Curlec appends razorpay_payment_link_id and its signature. MiseChef uses
  // that Link ID only to read its order; the signed webhook remains payment truth.
  url.searchParams.set('payment_provider', 'curlec');
  url.searchParams.set('payment_access_token', checkoutAccessToken);
  return url.toString();
};

export const createCurlecPaymentLinkAdapter = (keyId, keySecret, { fetchImpl = fetch } = {}) => {
  if (!readString(keyId) || !readString(keySecret)) throw new Error('Curlec is not configured.');
  return {
    provider: 'curlec', mode: CURLEC_PAYMENT_LINK_MODE, requiresSellingWorkspace: true,
    promotionCodeLifecycle: true,
    async expirePromotionPayment({order}) {
      let id=readString(order.payment.providerPaymentId);
      if(!id) {
        const response=await fetchImpl(`${API_URL}?reference_id=${encodeURIComponent(paymentLinkReferenceId(order))}`,{headers:{authorization:authorizationHeader(keyId,keySecret)}});
        const body=await response.json();
        if(!response.ok) throw new CurlecPaymentLookupError();
        const links=(body.payment_links || []).filter(link=>link.reference_id===paymentLinkReferenceId(order));
        if(links.length!==1) throw new Error('Ambiguous provider creation requires reconciliation.');
        id=links[0].id;
      }
      const read=async()=>{const response=await fetchImpl(`${API_URL}/${encodeURIComponent(id)}`,{headers:{authorization:authorizationHeader(keyId,keySecret)}});if(!response.ok) throw new CurlecPaymentLookupError();return response.json();};
      let link=await read();
      if(link.status==='created') {
        await fetchImpl(`${API_URL}/${encodeURIComponent(id)}/cancel`,{method:'POST',headers:{authorization:authorizationHeader(keyId,keySecret)}});
        link=await read();
      }
      if(link.id!==id || link.notes?.misechefOrderId!==order.id || Number(link.amount)!==order.payment.amountMinor || link.currency!==order.currency) throw new CurlecPaymentLookupError();
      if(link.status==='paid') return await this.retrieveVerifiedCapturedPayment({order:{...order,payment:{...order.payment,providerPaymentId:id}}});
      if(!['cancelled','expired'].includes(link.status) || Number(link.amount_paid)!==0) throw new Error('Payment is still pending.');
      return {providerPaymentId:id,orderId:order.id,amountMinor:order.payment.amountMinor,currency:order.currency,status:PAYMENT_STATUS.cancelled,promotionTerminal:true};
    },
    async createPayment({ order, returnUrl, checkoutAccessToken }) {
      const customerEmail = readString(order.customerEmail);
      if (!customerEmail) throw new Error('A valid customer email is required for a Curlec Payment Link.');
      let response;
      try {
        response = await fetchImpl(API_URL, {
          method: 'POST',
          headers: { authorization: authorizationHeader(keyId, keySecret), 'content-type': 'application/json' },
          body: JSON.stringify({
            // Derived exclusively from the server-built order.
            amount: order.payment.amountMinor, currency: order.currency, accept_partial: false,
            ...(order.promotionCodeSnapshot ? {expire_by:Math.floor(Date.parse(order.promotionCodeSnapshot.reservationExpiresAt)/1000)} : {}),
            reference_id: paymentLinkReferenceId(order), description: `Order ${order.orderNumber}`,
            customer: {
              name: readString(order.customerName), contact: normalizeCurlecContact(order.phone),
              email: customerEmail
            },
            notify: { sms: false, email: false }, reminder_enable: false,
            callback_url: paymentLinkCallbackUrl({ returnUrl, checkoutAccessToken }), callback_method: 'get',
            notes: { misechefOrderId: order.id, misechefOrderNumber: order.orderNumber },
            // Explicitly disable Card while retaining FPX and Wallets (including TNG).
            options: { checkout: { method: { fpx: true, card: false, wallet: true } } }
          })
        });
      } catch { throw new CurlecOrderCreationError(); }
      const paymentLink = await response.json().catch(() => ({}));
      if (!response.ok || !readString(paymentLink?.id) || !readString(paymentLink?.short_url)) {
        const error=new CurlecOrderCreationError({ httpStatus: response.status, errorCode: paymentLink?.error?.code, errorDescription: paymentLink?.error?.description || paymentLink?.error?.message });
        error.promotionDefinitelyNotCreated = [400,401,403,422].includes(response.status) && !/reference|duplicate/i.test(paymentLink?.error?.description || '');
        throw error;
      }
      if (Number(paymentLink.amount) !== Number(order.payment.amountMinor) || readString(paymentLink.currency).toUpperCase() !== readString(order.currency)) throw new Error('Curlec payment link amount validation failed.');
      return { providerPaymentId: paymentLink.id, checkout: { type: 'curlec_payment_link', redirectUrl: paymentLink.short_url } };
    },
    async retrievePayment(providerPaymentId, { db } = {}) {
      const snapshot = await db.collection('storeOrders').where('payment.providerPaymentId', '==', readString(providerPaymentId)).limit(1).get();
      const document = snapshot.docs[0];
      if (!document) throw new Error('The matching MiseChef order could not be found.');
      const order = document.data();
      return { providerPaymentId: readString(providerPaymentId), orderId: document.id, amountMinor: Number(order.payment?.amountMinor), currency: readString(order.currency), status: readString(order.payment?.status) || PAYMENT_STATUS.pending, providerStatus: readString(order.payment?.status), paymentMethod: readString(order.payment?.providerPaymentMethod), providerTransactionId: readString(order.payment?.providerTransactionId), failureCode: readString(order.payment?.failureCode) };
    },
    async retrieveVerifiedCapturedPayment({ order }) {
      const providerPaymentId = readString(order?.payment?.providerPaymentId);
      if (!providerPaymentId.startsWith('plink_')) throw new CurlecPaymentLookupError();
      let response;
      try {
        response = await fetchImpl(`${API_URL}/${encodeURIComponent(providerPaymentId)}`, {
          headers: { authorization: authorizationHeader(keyId, keySecret) }
        });
      } catch {
        throw new CurlecPaymentLookupError();
      }
      const paymentLink = await response.json().catch(() => ({}));
      if (!response.ok) throw new CurlecPaymentLookupError();
      const payments = Array.isArray(paymentLink?.payments) ? paymentLink.payments : [];
      const capturedPayments = payments.filter(payment => (
        readString(payment?.status) === 'captured'
        && Number(payment?.amount) === Number(order.payment?.amountMinor)
        && readString(payment?.payment_id)
      ));
      if (readString(paymentLink?.id) !== providerPaymentId
        || readString(paymentLink?.status) !== 'paid'
        || Number(paymentLink?.amount) !== Number(order.payment?.amountMinor)
        || Number(paymentLink?.amount_paid) !== Number(order.payment?.amountMinor)
        || readString(paymentLink?.currency).toUpperCase() !== readString(order.currency).toUpperCase()
        || readString(paymentLink?.notes?.misechefOrderId) !== readString(order.id)
        || capturedPayments.length !== 1) return null;
      const capturedPayment = capturedPayments[0];
      return {
        providerPaymentId,
        providerTransactionId: readString(capturedPayment.payment_id),
        orderId: readString(order.id), amountMinor: Number(order.payment.amountMinor),
        currency: readString(order.currency).toUpperCase(), status: PAYMENT_STATUS.paid,
        ...(Number.isFinite(capturedPayment.created_at) ? {paidAt:new Date(capturedPayment.created_at*1000).toISOString()} : {}),
        providerStatus: 'captured', paymentMethod: readString(capturedPayment.method), failureCode: ''
      };
    },
    async cancelPayment(providerPaymentId,{db}={}) {
      const snapshot=await db.collection('storeOrders').where('payment.providerPaymentId','==',providerPaymentId).limit(1).get();
      const doc=snapshot.docs[0];
      if(!doc || !doc.data().promotionCodeSnapshot) throw new Error('Curlec payment link cancellation is not available from checkout.');
      return this.expirePromotionPayment({order:{id:doc.id,...doc.data()}});
    },
    readWebhookUpdate(event) {
      if (readString(event?.event) !== 'payment_link.paid') return { kind: 'ignored' };
      const paymentLink = event?.payload?.payment_link?.entity;
      const payment = event?.payload?.payment?.entity;
      if (!paymentLink || !payment || payment.status !== 'captured' || payment.captured !== true) throw new Error('Curlec paid event does not contain a captured payment.');
      const paymentEntry=Array.isArray(paymentLink.payments) ? paymentLink.payments.find(row=>row.payment_id===payment.id && row.status==='captured' && Number(row.amount)===Number(payment.amount)) : null;
      // The signed paid entity records its payment time; root event creation
      // time is not necessarily the capture day. API recovery uses payments[].created_at.
      const paidAt=paymentEntry?.created_at ?? paymentLink.updated_at;
      return { kind: 'payment', payment: {
        // Persisted Payment Link ID is the only gateway-to-order lookup key.
        providerPaymentId: readString(paymentLink.id), providerTransactionId: readString(payment.id),
        orderId: readString(paymentLink.notes?.misechefOrderId), amountMinor: Number(payment.amount),
        currency: readString(payment.currency).toUpperCase(), status: PAYMENT_STATUS.paid,
        ...(Number.isFinite(paidAt) ? {paidAt:new Date(paidAt*1000).toISOString()} : {}),
        providerStatus: readString(payment.status), paymentMethod: readString(payment.method), failureCode: ''
      } };
    }
  };
};
