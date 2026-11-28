import {usePosPromotions} from './usePosPromotions';
import ManualDiscountControl, {previewPosDiscount, type ManualDiscount} from './ManualDiscountControl';
import PasteOrderButton, {type PasteDraft} from './PasteOrderButton';
import "./manualPosOrders.css";
import PosAddressPicker from './PosAddressPicker';
import { currentPosQuote, posInitialItemDate, claimPosAdd, type PosDestination, type PosQuote } from './posOrderEntryModel';
import WhatsAppCustomerActions from "./WhatsAppCustomerActions";
import { previewManualLines, type ManualLine } from "./manualPosPreview";
import {
  resolveHealthyLunchDay,
  resolvePlanMeal,
  getWeeklyDates,
  WEEKLY_DAYS,
} from "../../../functions/storeWeeklyMealPlan.js";
import { useEffect, useRef, useState } from "react";
import { storeOrderService, storeService } from "./services";
import type {
  CartSelection,
  StoreOrder,
  StoreProduct,
  StoreSet,
  StoreOptionGroup,
} from "./types";
import { shiftDateKey, toMalaysiaDateKey } from "./posOrderModel";
import { getDefaultStoreSetSelections } from "./storeSetModel";
import { printManualReceipt, printCustomerInvoice } from "./posWalkIn";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

type Line = ManualLine;
type Draft = {
  source: string;
  customerName: string;
  phone: string;
  notes: string;
  lines: Line[];
  manualDiscount?: ManualDiscount;
  deliveryFeeOverride?: { amount: number; reason: string };
};
const empty = (): Draft => ({
  source: "whatsapp",
  customerName: "",
  phone: "",
  notes: "",
  lines: [],
});
export default function ManualPosOrders({
  workspaceId,
  storeId,
  country = "MY",
  storeName = "",
  canRecordReminders = false,
  canPreviewWhatsApp = false,
  pasteRequest,
  onPasteConsumed,
  onOrderChanged,
  refined = false,
  createRequest = 0,
  showPending = true,
  onCreateConsumed,
  onPendingCountChange,
  onPanelChange,
}: {
  workspaceId: string;
  storeId: string;
  country?: "MY" | "SG";
  storeName?: string;
  canRecordReminders?: boolean;
  canPreviewWhatsApp?: boolean;
  pasteRequest?: {id:string;draft:PasteDraft} | null;
  onPasteConsumed?: ()=>void;
  onOrderChanged?: ()=>void;
  refined?: boolean;
  createRequest?: number;
  showPending?: boolean;
  onCreateConsumed?: ()=>void;
  onPendingCountChange?: (count:number)=>void;
  onPanelChange?: (open:boolean)=>void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [sets, setSets] = useState<StoreSet[]>([]);
  const [groups, setGroups] = useState<StoreOptionGroup[]>([]);
  const [privateItems, setPrivateItems] = useState<
    Array<{ name: string; unitPrice: number; notes: string }>
  >([]);
  const [currency, setCurrency] = useState("MYR");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [posFullAccess, setPosFullAccess] = useState(false);
  const [defaultDate, setDefaultDate] = useState(
    shiftDateKey(toMalaysiaDateKey(), 1),
  );
  const [defaultTime, setDefaultTime] = useState("12:00");
  const [defaultMethod,setDefaultMethod]=useState('pickup');
  const [defaultDestination,setDefaultDestination]=useState<PosDestination>();
  const recentAdds=useRef(new Map<string,number>());
  const mainDefaults = {date:defaultDate,time:defaultTime,method:defaultMethod==='pickup'?'pickup':'delivery',deliveryArrangement:defaultMethod==='store_delivery'?'store' as const:'customer' as const,deliveryAddress:defaultDestination?.formattedAddress || '',...(defaultDestination?{destination:defaultDestination}:{})};
  const updateMain = (patch:Partial<Line>) => setDraft(d=>({...d,lines:d.lines.map(line=>line.inheritSchedule?{...line,...patch}:line)}));

  const [manualOrders, setManualOrders] = useState<StoreOrder[]>([]);
  const pending = manualOrders.filter(
    (order) => order.payment.status === "pending",
  );
  const paid = manualOrders.filter((order) => order.payment.status === "paid");
  const posProducts = posFullAccess ? products.map((product) => ({ ...product, available: true, healthyLunchBlockedDates: [] })) : products;
  const preview = previewManualLines(draft.lines, posProducts, sets, groups, posFullAccess);

  const money = (minor: number) => `${currency} ${(minor / 100).toFixed(2)}`;
  const [slug, setSlug] = useState("");
  const promotionState=usePosPromotions(workspaceId,storeId,slug,open);
  const discountPreview=previewPosDiscount(preview.rows.map(row=>row.pricingItem),draft.manualDiscount,posFullAccess,promotionState.promotions,promotionState.now);
  const [saved, setSaved] = useState<StoreOrder | null>(null);
  const [editing, setEditing] = useState<StoreOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState<PosQuote | null>(null);
  const [quoteKey, setQuoteKey] = useState('');
  const [quoting, setQuoting] = useState(false);
  const quotationInFlight = useRef(false);
  const attemptedQuoteKey = useRef('');
  const [quoteClock,setQuoteClock]=useState(Date.now());
  const [feeMode, setFeeMode] = useState<'estimate' | 'manual'>('estimate');
  const deliveryKey = JSON.stringify({ draft: {...draft,manualDiscount:undefined}, storeId, workspaceId });
  const hasStoreDelivery = draft.lines.some(line => line.method === 'delivery' && line.deliveryArrangement === 'store');
  const usableQuote = currentPosQuote(deliveryQuote, quoteKey, deliveryKey, quoteClock);
  const deliveryFee = hasStoreDelivery ? feeMode === 'manual' ? draft.deliveryFeeOverride?.amount : usableQuote?.customerDeliveryFee : 0;
  const quoteDelivery = async () => {
    if (quotationInFlight.current) return;
    quotationInFlight.current = true;
    const key = deliveryKey;
    attemptedQuoteKey.current = key;
    setQuoting(true); setError('');
    try {
      const input = { ...draft }; delete input.deliveryFeeOverride;
      const quote = await storeOrderService.quotePosDelivery({ ...input, ...(editing?.manualOrder?.posAddOrder ? { posAddOrder: true } : {}), manualPos: true, workspaceId, storeId, slug });
      setDeliveryQuote(quote); setQuoteKey(key);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to estimate delivery.'); }
    finally { quotationInFlight.current = false; setQuoting(false); }
  };
  useEffect(()=>{
    if (!deliveryQuote) return;
    const timer=setInterval(()=>setQuoteClock(Date.now()),1000);
    return ()=>clearInterval(timer);
  },[deliveryQuote]);
  useEffect(()=>{
    if (!open || !hasStoreDelivery || feeMode!=='estimate' || quoting || usableQuote || attemptedQuoteKey.current===deliveryKey || !draft.customerName.trim() || preview.totalMinor===null || !draft.lines.every(line=>line.date && line.time && (line.deliveryArrangement!=='store' || line.destination?.placeId))) return;
    const timer=setTimeout(()=>void quoteDelivery(),600);
    return ()=>clearTimeout(timer);
  },[deliveryKey,open,hasStoreDelivery,feeMode,quoting]);
  const [pay, setPay] = useState<StoreOrder | null>(null);
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [received, setReceived] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const inFlight = useRef(false);
  useEffect(() => {
    requestId.current = crypto.randomUUID();
  }, [draft]);
  useEffect(
    () =>
      storeOrderService.subscribePendingManualOrders(
        storeId,
        workspaceId,
        setManualOrders,
        (e) => setError(e.message),
        true,
      ),
    [storeId, workspaceId],
  );
  const load = async (order?: StoreOrder, pasted?: PasteDraft) => {
    setError("");
    setDeliveryQuote(null); attemptedQuoteKey.current=''; setFeeMode(order?.manualOrder?.draft?.deliveryFeeOverride || pasted?.deliveryFeeOverride ? "manual" : "estimate");
    setBusy(true);
    setCatalogLoading(true);
    setOpen(true);
    setDraft(
      order ? (structuredClone(order.manualOrder!.draft) as Draft) : pasted || empty(),
    );
    setEditing(order || null);
    setProducts([]);
    setSets([]);
    setGroups([]);
    setPosFullAccess(false);
    setPrivateItems([]);
    setSlug("");
    try {
      const uid = auth?.currentUser?.uid || "";
      const [store, workspaceRecord, memberRecord] = await Promise.all([
        storeService.getWorkspaceStore(workspaceId),
        db && uid ? getDoc(doc(db, "workspaces", workspaceId)) : null,
        db && uid ? getDoc(doc(db, "workspaceMembers", `${workspaceId}_${uid}`)) : null,
      ]);
      if (!store || store.id !== storeId || store.workspaceId !== workspaceId || !store.slug)
        throw new Error(
          "This Store is unavailable. Close and retry loading the catalog.",
        );
      const member = memberRecord?.data();
      const fullAccess = Boolean(uid && (workspaceRecord?.data()?.ownerId === uid || (member?.userId === uid && member?.workspaceId === workspaceId && member?.status === "Active" && ["Owner", "Manager"].includes(member?.role))));
      const [products, sets, groups, privateItems] = await Promise.all([
        storeService.listManualPosProducts(workspaceId, storeId, fullAccess),
        storeService.listSets(workspaceId),
        storeService.listOptionGroups(workspaceId),
        storeOrderService.listPrivatePosItems(workspaceId),
      ]);
      setSlug(store.slug);
      setPosFullAccess(fullAccess);
      setCurrency(store.currency);
      setProducts(products.filter((p) => (fullAccess || p.available) && p.storeId === storeId && p.workspaceId === workspaceId));
      setSets(sets.filter((s) => s.available && s.storeId === storeId));
      setGroups(groups);
      setPrivateItems(privateItems);
      setDraft(
        order ? (structuredClone(order.manualOrder!.draft) as Draft) : pasted || empty(),
      );
      const restored = order ? structuredClone(order.manualOrder!.draft) as Draft : pasted || empty();
      const primary = restored.lines.find(line=>line.inheritSchedule) || restored.lines[0];
      setDefaultDate(primary?.date || (fullAccess ? toMalaysiaDateKey() : shiftDateKey(toMalaysiaDateKey(),1)));
      setDefaultTime(primary?.time || '12:00');
      setDefaultMethod(primary?.method==='delivery' ? primary.deliveryArrangement==='store' ? 'store_delivery' : 'delivery' : 'pickup');
      setDefaultDestination(primary?.destination || (primary?.deliveryAddress ? {formattedAddress:primary.deliveryAddress,latitude:'',longitude:''} : undefined));
      recentAdds.current.clear();
      setEditing(order || null);
      requestId.current = crypto.randomUUID();
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load catalog.");
    } finally {
      setBusy(false);
      setCatalogLoading(false);
    }
  };
  useEffect(() => {
    if (!pasteRequest) return;
    void load(undefined, pasteRequest.draft);
    onPasteConsumed?.();
  }, [pasteRequest?.id]);
  const add = (
    selection?: Partial<CartSelection>,
    custom?: Line["custom"],
    notes = "",
  ) => {
    const key=selection?.productId || selection?.setId || custom?.name || 'custom';
    if(!claimPosAdd(recentAdds.current,key,Date.now()))return;
    setDraft((d) => ({
      ...d,
      lines: [
        ...d.lines,
        {
          ...mainDefaults,
          inheritSchedule: products.find(product=>product.id===selection?.productId)?.productType!=="weekly_meal_plan",
          quantity: 1,
          date: posInitialItemDate(products.find(product => product.id === selection?.productId), defaultDate, selection?.healthyLunchDate),
          time: defaultTime,
          notes,
          ...(selection ? { selection } : {}),
          ...(custom ? { custom } : {}),
        },
      ],
    }));
  };
  const update = (i: number, change: Partial<Line>) => {
    requestId.current = crypto.randomUUID();
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((line, index) =>
        index === i ? { ...line, ...change } : line,
      ),
    }));
  };
  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const input = { ...draft }; delete input.deliveryFeeOverride;
      if (!promotionState.ready) throw new Error(promotionState.error || 'Wait for promotion pricing to load.');
      if (discountPreview.error) throw new Error(discountPreview.error);
      const result = await storeOrderService.saveManualPosOrder({
        ...input,
        expectedPosPricing:discountPreview.expectation,
        ...(draft.manualDiscount ? {expectedDiscountMinor:discountPreview.manualAmountMinor} : {}),
        ...(editing?.manualOrder?.posAddOrder ? { posAddOrder: true, expectedSubtotalMinor: preview.totalMinor } : {}),
        ...(hasStoreDelivery && feeMode === "manual" ? { deliveryFeeOverride: draft.deliveryFeeOverride } : {}),
        ...(hasStoreDelivery && feeMode === "estimate" ? { posDeliveryQuoteId: usableQuote?.id } : {}),
        workspaceId,
        storeId,
        slug,
        requestId: requestId.current,
        ...(editing
          ? {
              orderId: editing.id,
              expectedRevision: editing.manualOrder!.revision,
            }
          : {}),
      });
      setSaved(await storeOrderService.getOrder(result.orderId));
      setOpen(false);
      onOrderChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!pay || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await storeOrderService.confirmManualPosPayment({
        orderId: pay.id,
        expectedRevision: pay.manualOrder!.revision,
        amountMinor: pay.payment.amountMinor,
        method,
        reference,
        received,
      });
      setSaved(await storeOrderService.getOrder(pay.id));
      setPay(null);
      onOrderChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to confirm payment.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  useEffect(()=>{onPendingCountChange?.(pending.length);},[pending.length,onPendingCountChange]);
  useEffect(()=>{onPanelChange?.(Boolean(open || saved || pay));},[open,saved,pay,onPanelChange]);
  const handledCreate = useRef(0);
  useEffect(()=>{if(!createRequest){handledCreate.current=0;return;}if(createRequest!==handledCreate.current){handledCreate.current=createRequest;onCreateConsumed?.();setSaved(null);void load();}},[createRequest]);
  const input = "rounded border p-2 text-slate-950 bg-white";
  const [productSearch,setProductSearch]=useState("");
  const [productCategory,setProductCategory]=useState<'menu'|'weekly'|'sets'|'private'>('menu');
  useEffect(()=>{if(open){setProductSearch("");setProductCategory('menu');}},[open]);
  const displayMoney=(minor:number)=>refined && currency==='MYR' ? money(minor).replace(/^MYR /,'RM ') : money(minor);
  const matchesProductSearch=(name:string)=>name.toLocaleLowerCase().includes(productSearch.trim().toLocaleLowerCase());
  return (
    <section
      className={refined ? "manual-pos pos-manual-refined" : "manual-pos m-4 rounded-xl border p-4"}
      aria-label="Manual POS orders"
    >
      {!refined && <button
        disabled={busy}
        className="rounded bg-blue-700 p-3 font-bold text-white"
        onClick={() => void load()}
      >
        Create Manual Order
      </button>}
      {error && (!refined || showPending || open || saved || pay) && <p role="alert">{error}</p>}
      {(!refined || (showPending && !open && !saved && !pay)) && <div className="pos-pending-list">
      <h3 className="mt-3 font-bold">
        Pending Manual Payments ({pending.length})
      </h3>
      <p className="manual-muted">
        Saved unpaid orders stay here until an Owner or Manager confirms
        receipt. They do not enter the kitchen queue.
      </p>
      {!pending.length && (
        <p className="manual-muted">No manual orders awaiting payment.</p>
      )}
      {refined && pending.length > 0 && <div className="pos-pending-head" aria-hidden="true">
        <span>Order Number</span><span>Customer</span><span>Fulfilment Date/Time</span><span>Payment Method</span><span>Amount</span><span>Status</span><span>Actions</span>
      </div>}
      {pending.map((order) => (
        <article key={order.id} className="pos-pending-row" aria-label={`Pending order ${order.orderNumber}`}>
          <b className="pos-pending-number" data-label="Order Number">{order.orderNumber}</b>
          <span className="pos-pending-customer" data-label="Customer">{order.customerName || "—"}</span>
          <span className="pos-pending-date" data-label="Fulfilment Date/Time" title={order.fulfilments?.map((day) => `${day.date} ${day.time || ""}`).join(" · ")}>{order.fulfilments?.length ? <>{order.fulfilments[0].date} {order.fulfilments[0].time || ""}{order.fulfilments.length > 1 && <small className="block">+{order.fulfilments.length - 1} more fulfilments</small>}</> : "—"}</span>
          <span className="pos-pending-method" data-label="Payment Method">{(order.weeklyPosLink?.provider || order.payment.providerPaymentMethod || (order.payment.provider !== 'manual' ? order.payment.provider : '') || 'Not selected').replaceAll('_', ' ')}</span>
          <strong className="pos-pending-amount" data-label="Amount">{order.currency === 'MYR' ? 'RM' : order.currency} {order.total.toFixed(2)}</strong>
          <span className="pos-pending-status" data-label="Status"><span className="manual-badge">Pending Payment</span></span>
          <div className="pos-pending-actions">
            <button
              disabled={busy}
              className="manual-primary"
              onClick={() => {
                setPay(order);
                setMethod("bank_transfer");
                setReceived(false);
                setReference("");
                setError("");
              }}
            >Confirm Payment</button>
            <details className="pos-pending-more">
              <summary aria-label={`More actions for ${order.orderNumber}`}>More <span aria-hidden="true">⋯</span></summary>
              <div>
                <button type="button" className="manual-secondary" disabled={busy} onClick={()=>void load(order)}>Edit before payment</button>
                <button type="button" className="manual-secondary" onClick={() => setSaved(order)}>View details</button>
              </div>
            </details>
          </div>
        </article>
      ))}
      </div>}
      {!refined && paid.length > 0 && (
        <details className="manual-section">
          <summary>Paid / Confirmed manual orders ({paid.length})</summary>
          {paid.map((order) => (
            <article key={order.id} className="manual-day">
              <strong>
                {order.orderNumber} · {order.customerName}
              </strong>{" "}
              <span className="manual-badge manual-paid">Paid / Confirmed</span>
              <p>
                {order.currency} {order.total.toFixed(2)}
              </p>
              <button
                className="manual-secondary"
                onClick={() => setSaved(order)}
              >
                View details
              </button>
            </article>
          ))}
        </details>
      )}
      {saved && (
        <section className="manual-section" aria-label="Manual order details">
          <h3>
            {saved.orderNumber} · {saved.customerName}
          </h3>
          <p role="status">
            <span
              className={`manual-badge ${saved.payment.status === "paid" ? "manual-paid" : ""}`}
            >
              {saved.payment.status === "paid"
                ? "Paid / Confirmed"
                : "Pending Payment"}
            </span>{" "}
            · {saved.currency} {saved.total.toFixed(2)}
          </p>
          <p className="manual-muted">
            {saved.payment.status === "paid"
              ? "Payment received. Each day's fulfilment can now be prepared independently in the daily queue."
              : "Find this order in Pending Manual Payments above. Confirm receipt of funds before preparation or kitchen printing."}
          </p>
          {saved.fulfilments?.map((day) => (
            <div className="manual-day" key={day.id}>
              <strong>
                {day.date} · {day.time} ·{" "}
                {day.method === "delivery" ? "Delivery" : "Pickup"}
              </strong>
              {day.allocations.map((allocation, index) => (
                <p key={index}>
                  {allocation.quantity} ×{" "}
                  {saved.items[allocation.itemIndex]?.productName}
                </p>
              ))}
            </div>
          ))}
          {saved.totals && <dl className="my-3 text-sm"><div>Subtotal: {saved.currency} {saved.totals.merchandiseSubtotal.toFixed(2)}</div><div>Automatic promotions: −{saved.currency} {(saved.totals.automaticDiscountTotal ?? (saved.manualDiscountSnapshot?0:saved.totals.discountTotal)).toFixed(2)}</div><div>Manual discount: −{saved.currency} {(saved.totals.manualDiscountTotal ?? (saved.manualDiscountSnapshot?saved.totals.discountTotal:0)).toFixed(2)}</div><div>Delivery fee: {saved.currency} {saved.totals.deliveryFee.toFixed(2)}</div><div>Final payable: {saved.currency} {saved.total.toFixed(2)}</div></dl>}
          {saved.payment.status==='paid' && <button type="button" className="manual-secondary" onClick={()=>{try{printCustomerInvoice(saved);}catch(error){setError(String(error));}}}>Print customer invoice</button>}
          <div key={saved.id}><WhatsAppCustomerActions order={saved} country={country} storeName={storeName} canRecordReminder={canRecordReminders} canPreview={canPreviewWhatsApp} /></div>
          <div className="manual-actions">
            {saved.payment.status === "paid" ? (
              <button
                className="manual-secondary"
                onClick={() => {
                  try {
                    printManualReceipt(saved);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Print full payment receipt
              </button>
            ) : (
              <button
                className="manual-primary"
                onClick={() => {
                  setPay(saved);
                  setMethod("bank_transfer");
                  setReceived(false);
                  setReference("");
                  setError("");
                }}
              >
                Confirm Payment
              </button>
            )}
            <button className="manual-secondary" onClick={() => setSaved(null)}>
              Close details
            </button>
          </div>
        </section>
      )}
      {open && (
        <div className="manual-overlay">
          <section
            role={refined ? "region" : "dialog"}
            aria-modal={refined ? undefined : true}
            aria-label="Create Manual Order"
            className="manual-dialog manual-order-workspace"
          >
            <div className="manual-workspace-header"><h2 className="text-xl font-bold">
              {editing ? `Edit ${editing.orderNumber}` : "Create Manual Order"}
            </h2>
            {refined && <button type="button" disabled={busy} className="manual-secondary" onClick={()=>setOpen(false)}>Back to orders</button>}
            <span className="manual-badge">Pending Payment</span>
            <PasteOrderButton workspaceId={workspaceId} storeId={storeId} slug={slug} products={posProducts} sets={sets} disabled={busy} onApply={pasted=>{setDraft(pasted);setFeeMode(pasted.deliveryFeeOverride?'manual':'estimate');setDeliveryQuote(null);}} />
            </div><details className="manual-order-guidance"><summary>Order guidance</summary><p className="manual-muted">
              Save as Pending Payment. Confirm only after payment is actually
              received. {posFullAccess ? "Owner and Manager can record any fulfilment date and time, including special school deliveries outside Delivery Hours and historical orders. Record the agreed arrangement in remarks." : "Preorders start tomorrow; immediate Walk-in stays available under Add Order."} Choose store delivery for a quote or use customer-arranged delivery.
            </p></details>
            <div className="manual-workspace-grid"><div className="manual-workspace-left">
            <fieldset disabled={busy} className="manual-section manual-grid manual-customer-fields">
              <legend>Customer &amp; fulfilment</legend>
              <label>
                Source{" "}
                <select
                  className={input}
                  value={draft.source}
                  onChange={(e) =>
                    setDraft({ ...draft, source: e.target.value })
                  }
                >
                  {["whatsapp", "phone", "walk_in", "other"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Customer name{" "}
                <input
                  className={input}
                  value={draft.customerName}
                  maxLength={120}
                  onChange={(e) =>
                    setDraft({ ...draft, customerName: e.target.value })
                  }
                />
              </label>
              <label>
                Customer phone{" "}
                <input
                  className={input}
                  type="tel"
                  value={draft.phone}
                  maxLength={40}
                  onChange={(e) =>
                    setDraft({ ...draft, phone: e.target.value })
                  }
                />
              </label>
              <details className="manual-order-notes" open={draft.notes ? true : undefined}><summary>Order notes (optional)</summary>
              <label>
                Order notes{" "}
                <textarea
                  className={input}
                  value={draft.notes}
                  maxLength={500}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                />
              </label>
              </details>
              <div className="manual-grid col-span-full manual-main-controls">
                <label>
                  Main fulfilment date
                  <input
                    type="date"
                    min={posFullAccess ? undefined : shiftDateKey(toMalaysiaDateKey(), 1)}
                    value={defaultDate}
                    onChange={(e) => {setDefaultDate(e.target.value);updateMain({date:e.target.value});}}
                  />
                </label>
                <label>
                  Main exact time
                  <input
                    type="time"
                    value={defaultTime}
                    onChange={(e) => {setDefaultTime(e.target.value);updateMain({time:e.target.value});}}
                  />
                </label>

                <label>Fulfilment<select value={defaultMethod} onChange={e=>{setDefaultMethod(e.target.value);updateMain({method:e.target.value==='pickup'?'pickup':'delivery',deliveryArrangement:e.target.value==='store_delivery'?'store':'customer'});}}><option value="pickup">Pickup</option><option value="store_delivery">Store delivery</option><option value="delivery">Customer-arranged delivery</option></select></label>
                {posFullAccess&&<button className="manual-secondary manual-immediate" type="button" onClick={()=>{const date=toMalaysiaDateKey(),time=new Date(Date.now()+28800000).toISOString().slice(11,16);setDefaultDate(date);setDefaultTime(time);setDefaultMethod('pickup');updateMain({date,time,method:'pickup'});}}>Immediate pickup</button>}
                {defaultMethod!=='pickup'&&<PosAddressPicker label="Main delivery address" disabled={busy} value={defaultDestination} onChange={destination=>{setDefaultDestination(destination);updateMain({destination,deliveryAddress:destination.formattedAddress});}}/>}
              </div>
            </fieldset>
            <section className="manual-section manual-product-selection">
              <h3>Product selection</h3>
              {catalogLoading && (
                <p role="status">Loading this Store’s catalog…</p>
              )}
              {!catalogLoading && slug && !products.length && !sets.length && (
                <p role="status">
                  No available menu items for this Store. Add a Custom Item or
                  make products available in Store management.
                </p>
              )}
              <fieldset disabled={busy || !slug} className="manual-product-picker">
                <legend className="sr-only">Choose an item to add</legend>
                <label>Search products<input type="search" value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Search menu, plans, sets or private items" /></label>
                <div className="manual-product-tabs" aria-label="Product categories">{([['menu','Menu'],['weekly','Weekly Plans'],['sets','Meal Sets'],['private','Private Items']] as const).map(([category,label])=><button key={category} type="button" aria-pressed={productCategory===category} onClick={()=>setProductCategory(category)}>{label}</button>)}</div>
                {(productCategory==='menu' || productCategory==='weekly') && <label>
                  {productCategory==='weekly' ? 'Weekly plan' : 'Menu'}
                  <select
                    aria-label={productCategory==='weekly' ? 'Add weekly plan' : 'Add menu item'}
                    className={input}
                    value=""
                    onChange={(e) => {
                      const p = products.find((p) => p.id === e.target.value);
                      if (p) add({ productId: p.id, selectedOptions: [] });
                    }}
                  >
                    <option value="">{productCategory==='weekly' ? 'Add weekly plan…' : 'Add menu item…'}</option>
                    {products.filter(p=>(productCategory==='weekly' ? p.productType==='weekly_meal_plan' : p.productType!=='weekly_meal_plan') && matchesProductSearch(p.name)).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.price.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>}
                {productCategory==='sets' && <label>
                  Meal set
                  <select
                    aria-label="Add set"
                    className={input}
                    value=""
                    onChange={(e) => {
                      const s = sets.find((s) => s.id === e.target.value);
                      if (s)
                        add({
                          setId: s.id,
                          selectedOptions: [],
                          selectedSetItems: getDefaultStoreSetSelections(
                            s,
                            posProducts,
                          ),
                        });
                    }}
                  >
                    <option value="">Add set…</option>
                    {sets.filter(s=>matchesProductSearch(s.name)).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>}
                <button
                  className="manual-secondary manual-custom-action"
                  onClick={() => add(undefined, { name: "", unitPrice: 0 })}
                >
                  Add Custom Item
                </button>
                {productCategory==='private' && <label>
                  Saved private items
                  <select
                    aria-label="Add saved private item"
                    className={input}
                    value=""
                    onChange={(e) => {
                      const p = privateItems[Number(e.target.value)];
                      if (p)
                        add(
                          undefined,
                          { name: p.name, unitPrice: p.unitPrice },
                          p.notes,
                        );
                    }}
                  >
                    <option value="">Saved private POS items…</option>
                    {privateItems.map((p,i)=>({p,i})).filter(({p})=>matchesProductSearch(p.name)).map(({p,i}) => (
                      <option key={i} value={i}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>}
              </fieldset>
            </section>
            </div><aside className="manual-workspace-cart" aria-label="Manual order cart"><h3>Cart ({draft.lines.reduce((sum,line)=>sum+line.quantity,0)})</h3>
            {!draft.lines.length && <p className="manual-muted">Choose a product to start this order.</p>}
            <div className="manual-cart-items">
            {draft.lines.map((line, i) => {
              const product = posProducts.find(
                (p) => p.id === line.selection?.productId,
              );
              const set = sets.find((s) => s.id === line.selection?.setId);
              const plan =
                posProducts.find(
                  (p) => p.id === line.selection?.healthyLunchPlanId,
                ) || product;
              const mealDays =
                plan?.productType === "weekly_meal_plan"
                  ? line.selection?.healthyLunchDate
                    ? [
                        {
                          date: line.selection.healthyLunchDate,
                          meal: resolveHealthyLunchDay(
                            plan,
                            posProducts,
                            line.selection.healthyLunchDate,
                          ),
                        },
                      ]
                    : getWeeklyDates(line.date).map((date, index) => ({
                        date,
                        meal: resolvePlanMeal(
                          plan,
                          posProducts,
                          line.date,
                          WEEKLY_DAYS[index],
                        ),
                      }))
                  : [];
              return (
                <fieldset
                  key={i}
                  disabled={busy}
                  className={`manual-section manual-fields manual-cart-line${line.custom ? ' manual-cart-custom' : ''}`}
                >
                  <legend className="font-bold">
                    {line.custom
                      ? "Custom Item"
                      : product?.name || set?.name || "Item"}
                  </legend>
                  <p className="manual-muted manual-line-price">
                    Unit: {displayMoney(preview.rows[i].unitMinor)} · Subtotal:{" "}
                    {preview.rows[i].totalMinor === null
                      ? "Complete item"
                      : displayMoney(preview.rows[i].totalMinor!)}
                  </p>
                  {line.custom && (
                    <>
                      <label>
                        Item name{" "}
                        <input
                          className={input}
                          value={line.custom.name}
                          onChange={(e) =>
                            update(i, {
                              custom: { ...line.custom!, name: e.target.value },
                            })
                          }
                        />
                      </label>
                      <label>
                        Unit price{" "}
                        <input
                          type="number"
                          className={input}
                          min="0"
                          max="100000"
                          step="0.01"
                          value={line.custom.unitPrice}
                          onChange={(e) =>
                            update(i, {
                              custom: {
                                ...line.custom!,
                                unitPrice: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!line.custom.savePrivate}
                          onChange={(e) =>
                            update(i, {
                              custom: {
                                ...line.custom!,
                                savePrivate: e.target.checked,
                              },
                            })
                          }
                        />{" "}
                        Save privately for POS
                      </label>
                    </>
                  )}
                  <label className="manual-line-quantity">
                    <span className="sr-only">Quantity</span>
                    <input
                      className={input}
                      type="number"
                      min="1"
                      max={posFullAccess ? 10000 : 20}
                      value={line.quantity}
                      onChange={(e) =>
                        update(i, { quantity: Number(e.target.value) })
                      }
                    />
                  </label>
                  <details className="manual-item-settings" open={plan?.productType==='weekly_meal_plan' || !line.inheritSchedule ? true : undefined}><summary>Fulfilment &amp; item notes</summary><div className="manual-item-settings-grid">
                  {plan?.productType!=="weekly_meal_plan"&&<label><input type="checkbox" checked={!line.inheritSchedule} onChange={e=>update(i,e.target.checked?{inheritSchedule:false}:{...mainDefaults,inheritSchedule:true})}/> Override main fulfilment for this item</label>}
                  {line.inheritSchedule&&<p className="manual-muted">Main schedule · {line.date} · {line.time} · {line.method}</p>}
                  <label style={line.inheritSchedule?{display:'none'}:undefined}>
                    {plan?.productType === "weekly_meal_plan" &&
                    !line.selection?.healthyLunchDate
                      ? "Start Monday (5 days)"
                      : "Fulfilment date"}{" "}
                    <input
                      className={input}
                      type="date"
                      min={posFullAccess ? undefined : shiftDateKey(toMalaysiaDateKey(), 1)}
                      value={line.date}
                      onChange={(e) =>
                        update(i, {
                          date: e.target.value,
                          ...(line.selection?.healthyLunchDate && !editing?.manualOrder?.posAddOrder
                            ? {
                                selection: {
                                  ...line.selection,
                                  productId:
                                    resolveHealthyLunchDay(
                                      plan,
                                      products,
                                      e.target.value,
                                    )?.id || line.selection.productId,
                                  healthyLunchDate: e.target.value,
                                  selectedMealOptions: [],
                                },
                              }
                            : {}),
                        })
                      }
                    />
                  </label>
                  {editing?.manualOrder?.posAddOrder && line.selection?.healthyLunchDate && <p>Menu source: {line.selection.healthyLunchDate} · Changing fulfilment does not change the meal.</p>}
                  {plan?.productType === "weekly_meal_plan" && !editing?.manualOrder?.posAddOrder && (
                    <label>
                      Plan selection{" "}
                      <select
                        className={input}
                        value={
                          line.selection?.healthyLunchDate ? "day" : "week"
                        }
                        onChange={(e) => {
                          const {
                            healthyLunchDate,
                            healthyLunchPlanId,
                            ...selection
                          } = line.selection!;
                          update(i, {
                            selection:
                              e.target.value === "day"
                                ? {
                                    ...selection,
                                    productId:
                                      resolveHealthyLunchDay(
                                        plan,
                                        products,
                                        line.date,
                                      )?.id || plan!.id,
                                    healthyLunchPlanId: plan!.id,
                                    healthyLunchDate: line.date,
                                  }
                                : {
                                    ...selection,
                                    productId: plan!.id,
                                    selectedMealOptions: [],
                                  },
                          });
                        }}
                      >
                        <option value="week">Full week</option>
                        <option value="day">Individual menu day</option>
                      </select>
                    </label>
                  )}
                  <label style={line.inheritSchedule?{display:'none'}:undefined}>
                    Time{" "}
                    <input
                      className={input}
                      type="time"
                      step="1800"
                      value={line.time}
                      onChange={(e) => update(i, { time: e.target.value })}
                    />
                  </label>
                  <label style={line.inheritSchedule?{display:'none'}:undefined}>
                    Mode{" "}
                    <select
                      className={input}
                      value={line.method === 'delivery' && line.deliveryArrangement === 'store' ? 'store_delivery' : line.method}
                      onChange={(e) => update(i, { method: e.target.value === 'store_delivery' ? 'delivery' : e.target.value, deliveryArrangement: e.target.value === 'store_delivery' ? 'store' : 'customer' })}
                    >
                      <option value="pickup">Pickup</option>
                      <option value="store_delivery">Store delivery · estimate fee</option>
                      <option value="delivery">
                        Customer-arranged delivery
                      </option>
                    </select>
                  </label>
                  {line.method === "delivery" && !line.inheritSchedule && (
                    <PosAddressPicker label={`Delivery address ${i + 1}`} disabled={busy} value={line.destination || { formattedAddress: line.deliveryAddress, latitude: '', longitude: '' }} onChange={destination => update(i, { destination, deliveryAddress: destination.formattedAddress })} />
                  )}
                  <label>
                    Item notes{" "}
                    <input
                      className={input}
                      value={line.notes}
                      maxLength={500}
                      onChange={(e) => update(i, { notes: e.target.value })}
                    />
                  </label>
                  </div></details>
                  {product?.optionGroupIds?.map((id) => {
                    const g = groups.find((g) => g.id === id);
                    return (
                      g && (
                        <label key={id}>
                          {g.name}
                          {g.required ? " (required)" : ""}
                          <select
                            multiple={g.selectionType === "multiple"}
                            className={input}
                            value={
                              g.selectionType === "multiple"
                                ? (line.selection?.selectedOptions || [])
                                    .filter((o) => o.groupId === id)
                                    .map((o) => o.optionId)
                                : (line.selection?.selectedOptions || []).find(
                                    (o) => o.groupId === id,
                                  )?.optionId || ""
                            }
                            onChange={(e) =>
                              update(i, {
                                selection: {
                                  ...line.selection,
                                  selectedOptions: [
                                    ...(
                                      line.selection?.selectedOptions || []
                                    ).filter((o) => o.groupId !== id),
                                    ...(
                                      Array.from(
                                        e.currentTarget.selectedOptions,
                                      ) as HTMLOptionElement[]
                                    )
                                      .filter((o) => o.value)
                                      .map((o) => ({
                                        groupId: id,
                                        optionId: o.value,
                                      })),
                                  ],
                                },
                              })
                            }
                          >
                            <option value="">Choose…</option>
                            {g.options
                              .filter((o) => o.available)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )
                    );
                  })}
                  {mealDays.map(({ date, meal }) => (
                    <div key={date} className="w-full">
                      <b>
                        {date} · {meal?.name || "No meal on this date"}
                      </b>
                      {meal?.optionGroups?.map((group) => (
                        <label key={group.id} className="ml-3">
                          {group.name}
                          {group.required ? " (required)" : ""}
                          <select
                            multiple={group.selection === "multi"}
                            className={input}
                            value={
                              group.selection === "multi"
                                ? (line.selection?.selectedMealOptions || [])
                                    .filter(
                                      (o) =>
                                        o.serviceDate === date &&
                                        o.optionGroupId === group.id,
                                    )
                                    .map((o) => o.optionId)
                                : (
                                    line.selection?.selectedMealOptions || []
                                  ).find(
                                    (o) =>
                                      o.serviceDate === date &&
                                      o.optionGroupId === group.id,
                                  )?.optionId || ""
                            }
                            onChange={(e) =>
                              update(i, {
                                selection: {
                                  ...line.selection,
                                  selectedMealOptions: [
                                    ...(
                                      line.selection?.selectedMealOptions || []
                                    ).filter(
                                      (o) =>
                                        o.serviceDate !== date ||
                                        o.optionGroupId !== group.id,
                                    ),
                                    ...(
                                      Array.from(
                                        e.currentTarget.selectedOptions,
                                      ) as HTMLOptionElement[]
                                    )
                                      .filter((o) => o.value)
                                      .map((o) => ({
                                        serviceDate: date,
                                        optionGroupId: group.id,
                                        optionId: o.value,
                                      })),
                                  ],
                                },
                              })
                            }
                          >
                            <option value="">Choose…</option>
                            {group.options
                              .filter((o) => o.active !== false)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  ))}
                  {set?.groups.map((g) => (
                    <label key={g.id}>
                      {g.name}
                      <select
                        className={input}
                        value={
                          line.selection?.selectedSetItems?.find(
                            (s) => s.groupId === g.id,
                          )?.productId || ""
                        }
                        onChange={(e) =>
                          update(i, {
                            selection: {
                              ...line.selection,
                              selectedSetItems: [
                                ...(
                                  line.selection?.selectedSetItems || []
                                ).filter((s) => s.groupId !== g.id),
                                { groupId: g.id, productId: e.target.value },
                              ],
                            },
                          })
                        }
                      >
                        {g.options.map(({ productId: id }) => (
                          <option key={id} value={id}>
                            {products.find((p) => p.id === id)?.name || id}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {(discountPreview.automaticPricing.promotionSnapshot.lineAdjustments[i]?.discountAmount || 0)>0 && <p className="text-sm font-bold">Automatic promotional subtotal: {displayMoney(Math.round(discountPreview.automaticPricing.promotionSnapshot.lineAdjustments[i].finalLineTotal*100))} · saving {displayMoney(Math.round(discountPreview.automaticPricing.promotionSnapshot.lineAdjustments[i].discountAmount*100))}{draft.manualDiscount?.application==='replace'?' (replaced by manual discount)':''}</p>}
                  {preview.rows[i].error && (
                    <p role="alert">{preview.rows[i].error}</p>
                  )}
                  <button
                    className="manual-secondary"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        lines: draft.lines.filter((_, index) => index !== i),
                      })
                    }
                  >
                    Remove item
                  </button>
                </fieldset>
              );
            })}
            </div>
            <section
              className="manual-summary"
              aria-label="Daily order summary"
            >
              <h3>Pricing &amp; payment</h3>
              {preview.days.length>0 && <details className="manual-allocation-details"><summary>Daily fulfilment breakdown</summary>
              {preview.days.map((day) => (
                <div className="manual-day" key={day.date}>
                  <strong>{day.date} · Malaysia time</strong>
                  {day.entries.map((entry) => (
                    <div className="manual-summary-row" key={entry.index}>
                      <span>
                        {entry.time} ·{" "}
                        {entry.method === "pickup" ? "Pickup" : "Delivery"} ·{" "}
                        {entry.quantity} × {entry.name}
                        {entry.package ? " (weekly package allocation)" : ""}
                      </span>
                      <span>
                        {entry.amountMinor === null
                          ? "Incomplete"
                          : displayMoney(entry.amountMinor)}
                      </span>
                    </div>
                  ))}
                  <div className="manual-summary-row">
                    <strong>Day subtotal</strong>
                    <strong>
                      {day.entries.some((e) => e.amountMinor === null)
                        ? "Incomplete"
                        : displayMoney(day.totalMinor)}
                    </strong>
                  </div>
                </div>
              ))}
              </details>}
              {hasStoreDelivery && <fieldset className="manual-section">
                <legend>Delivery fee</legend>
                <label>Fee source<select value={feeMode} disabled={busy || quoting} onChange={e => setFeeMode(e.target.value as 'estimate' | 'manual')}>
                  <option value="estimate">Lalamove estimate</option>{posFullAccess && <option value="manual">Agreed / manual fee</option>}
                </select></label>
                {feeMode === 'estimate' ? <>
                  <button type="button" disabled={busy || quoting} onClick={() => void quoteDelivery()}>{quoting ? 'Estimating…' : 'Refresh delivery estimate'}</button>
                  {usableQuote ? <p role="status">Customer charge {displayMoney(Math.round(usableQuote.customerDeliveryFee * 100))} · provider cost {displayMoney(Math.round(usableQuote.providerDeliveryFee * 100))}. Expires {new Date(usableQuote.expiresAt).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} MYT.</p> : <p>Refresh after changing items, addresses or schedules.</p>}
                </> : <>
                  <label>Customer delivery charge<input disabled={busy} type="number" min="0" max="100000" step="0.01" value={draft.deliveryFeeOverride?.amount ?? ''} onChange={e => setDraft({ ...draft, deliveryFeeOverride: { amount: e.target.value === '' ? NaN : Number(e.target.value), reason: draft.deliveryFeeOverride?.reason || '' } })} /></label>
                  <label>Audit reason / agreed fee reference<input disabled={busy} maxLength={240} value={draft.deliveryFeeOverride?.reason || ''} onChange={e => setDraft({ ...draft, deliveryFeeOverride: { amount: draft.deliveryFeeOverride?.amount ?? NaN, reason: e.target.value } })} /></label>
                </>}
              </fieldset>}
              <ManualDiscountControl value={draft.manualDiscount} onChange={manualDiscount=>setDraft({...draft,manualDiscount})} items={preview.rows.map(row=>row.pricingItem)} authorized={posFullAccess && currency==="MYR"} promotions={promotionState.promotions} now={promotionState.now} disabled={busy || !promotionState.ready || preview.totalMinor===null} />
              {!promotionState.ready && <p role="status">{promotionState.error || "Loading automatic promotion pricing…"}</p>}
              {discountPreview.error && <p role="alert">{discountPreview.error}</p>}
              <div className="manual-summary-row"><span>Product subtotal</span><span>{preview.totalMinor === null ? 'Incomplete' : displayMoney(preview.totalMinor)}</span></div>
              <div className="manual-summary-row"><span>Delivery charge</span><span>{deliveryFee === undefined ? 'Estimate required' : displayMoney(Math.round(deliveryFee * 100))}</span></div>
              <div className="manual-summary-row"><span>Automatic promotions</span><span>−{displayMoney(discountPreview.automaticAmountMinor)}</span></div><div className="manual-summary-row"><span>Manual discount</span><span>−{displayMoney(discountPreview.manualAmountMinor)}</span></div>
              <div className="manual-total">
                <span>Grand total</span>
                <span>
                  {preview.totalMinor === null
                    ? "Complete item options"
                    : deliveryFee === undefined || !Number.isFinite(deliveryFee) ? "Complete delivery fee" : displayMoney(preview.totalMinor - discountPreview.amountMinor + Math.round(deliveryFee * 100))}
                </span>
              </div>
              <details className="manual-pricing-guidance"><summary>Pricing &amp; payment guidance</summary>
              <p className="manual-muted">
                Preview uses current catalog prices. The server validates the
                final saved amount. Weekly package prices are allocated across
                five days for this summary.
              </p>
              <p className="manual-muted">
                Saving does not confirm payment. After saving, use Pending
                Manual Payments → Confirm Payment. Paid / Confirmed means funds
                received and eligible for preparation.
              </p>
              </details>
            </section>
            {error && (!refined || showPending || open || saved || pay) && <p role="alert">{error}</p>}
            <div className="manual-actions">
              <button
                disabled={
                  busy || !promotionState.ready || Boolean(discountPreview.error) ||
                  !slug ||
                  !draft.lines.length ||
                  !draft.customerName.trim() ||
                  preview.totalMinor === null ||
                  preview.totalMinor <= 0 ||
                  (hasStoreDelivery && (deliveryFee === undefined || !Number.isFinite(deliveryFee) || (feeMode === "manual" && !draft.deliveryFeeOverride?.reason.trim())))
                }
                onClick={() => void save()}
                className="manual-primary"
              >
                {busy ? "Saving…" : "Save · Pending Payment"}
              </button>
              <button disabled={busy} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            </aside></div>
          </section>
        </div>
      )}
      {pay && (
        <div className="manual-overlay" style={{ zIndex: 120 }}>
          <section
            role={refined ? "region" : "dialog"}
            aria-modal={refined ? undefined : true}
            aria-label="Confirm received payment"
            className="manual-dialog"
            style={{ maxWidth: 560 }}
          >
            <h2 className="text-xl font-bold">
              Confirm Payment · {pay.orderNumber}
            </h2>
            <p>
              {pay.currency} {(pay.payment.amountMinor / 100).toFixed(2)} · One
              payment for all fulfilment days
            </p>
            <label>
              Method{" "}
              <select
                className={input}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {[
                  ["bank_transfer", "Bank transfer"],
                  ["cash", "Cash"],
                  ["tng", "TNG transfer / QR"],
                  ["fpx", "FPX (already received)"],
                  ["other", "Other"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Receipt / payment reference{" "}
              <input
                className={input}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="my-3 block">
              <input
                type="checkbox"
                checked={received}
                onChange={(e) => setReceived(e.target.checked)}
              />{" "}
              I verified the full payment was actually received.
            </label>
            <p className="manual-muted">
              Only Workspace Owner / Manager can confirm. This records an
              existing payment; it does not charge the customer. The saved
              amount and revision are verified securely.
            </p>
            {error && (!refined || showPending || open || saved || pay) && <p role="alert">{error}</p>}
            <button
              disabled={busy || !received || !reference.trim()}
              className="manual-primary"
              onClick={() => void confirm()}
            >
              {busy ? "Confirming…" : "Confirm Payment · Mark Paid / Confirmed"}
            </button>
            <button disabled={busy} onClick={() => setPay(null)}>
              Close
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
