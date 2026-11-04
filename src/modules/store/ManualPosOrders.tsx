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
import { printManualReceipt } from "./posWalkIn";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";

type Line = ManualLine;
type Draft = {
  source: string;
  customerName: string;
  phone: string;
  notes: string;
  lines: Line[];
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
  pasteRequest,
  onPasteConsumed,
}: {
  workspaceId: string;
  storeId: string;
  country?: "MY" | "SG";
  storeName?: string;
  canRecordReminders?: boolean;
  pasteRequest?: {id:string;draft:PasteDraft} | null;
  onPasteConsumed?: ()=>void;
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
  const deliveryKey = JSON.stringify({ draft, storeId, workspaceId });
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
      const quote = await storeOrderService.quotePosDelivery({ ...input, manualPos: true, workspaceId, storeId, slug });
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
      const result = await storeOrderService.saveManualPosOrder({
        ...input,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to confirm payment.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const input = "rounded border p-2 text-slate-950 bg-white";
  return (
    <section
      className="manual-pos m-4 rounded-xl border p-4"
      aria-label="Manual POS orders"
    >
      <button
        disabled={busy}
        className="rounded bg-blue-700 p-3 font-bold text-white"
        onClick={() => void load()}
      >
        Create Manual Order
      </button>
      {error && <p role="alert">{error}</p>}
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
      {pending.map((order) => (
        <article key={order.id} className="my-2 rounded border p-3">
          <b>
            {order.orderNumber} · {order.customerName}
          </b>
          <p>
            <span className="manual-badge">Pending Payment</span> ·{" "}
            {order.currency} {order.total.toFixed(2)}
          </p>
          <p className="manual-muted">
            {order.fulfilments
              ?.map((day) => `${day.date} ${day.time || ""}`)
              .join(" · ")}
          </p>
          <div className="manual-actions">
            <button
              disabled={busy}
              className="manual-secondary"
              onClick={() => void load(order)}
            >
              Edit before payment
            </button>
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
            >
              Confirm Payment
            </button>
            <button
              className="manual-secondary"
              onClick={() => setSaved(order)}
            >
              View details
            </button>
          </div>
        </article>
      ))}
      {paid.length > 0 && (
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
          <div key={saved.id}><WhatsAppCustomerActions order={saved} country={country} storeName={storeName} canRecordReminder={canRecordReminders} /></div>
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
            role="dialog"
            aria-modal="true"
            aria-label="Create Manual Order"
            className="manual-dialog"
          >
            <h2 className="text-xl font-bold">
              {editing ? `Edit ${editing.orderNumber}` : "Create Manual Order"}
            </h2>
            <span className="manual-badge">Pending Payment</span>
            <PasteOrderButton workspaceId={workspaceId} storeId={storeId} slug={slug} products={posProducts} sets={sets} disabled={busy} onApply={pasted=>{setDraft(pasted);setFeeMode(pasted.deliveryFeeOverride?'manual':'estimate');setDeliveryQuote(null);}} />
            <p className="manual-muted">
              Save as Pending Payment. Confirm only after payment is actually
              received. {posFullAccess ? "Owner and Manager can record any fulfilment date and time, including historical orders." : "Preorders start tomorrow; immediate Walk-in stays available under Add Order."} Choose store delivery for a quote or use customer-arranged delivery.
            </p>
            <fieldset disabled={busy} className="manual-section manual-grid">
              <legend>1. Customer &amp; Fulfilment</legend>
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
              <div className="manual-grid col-span-full">
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
                {posFullAccess&&<button type="button" onClick={()=>{const date=toMalaysiaDateKey(),time=new Date(Date.now()+28800000).toISOString().slice(11,16);setDefaultDate(date);setDefaultTime(time);setDefaultMethod('pickup');updateMain({date,time,method:'pickup'});}}>Immediate pickup</button>}
                <label>Fulfilment<select value={defaultMethod} onChange={e=>{setDefaultMethod(e.target.value);updateMain({method:e.target.value==='pickup'?'pickup':'delivery',deliveryArrangement:e.target.value==='store_delivery'?'store':'customer'});}}><option value="pickup">Pickup</option><option value="store_delivery">Store delivery</option><option value="delivery">Customer-arranged delivery</option></select></label>
                {defaultMethod!=='pickup'&&<PosAddressPicker label="Main delivery address" disabled={busy} value={defaultDestination} onChange={destination=>{setDefaultDestination(destination);updateMain({destination,deliveryAddress:destination.formattedAddress});}}/>}
              </div>
            </fieldset>
            <section className="manual-section">
              <h3>2. Product Selection</h3>
              <p role="status" className="manual-muted">{draft.lines.reduce((sum,line)=>sum+line.quantity,0)} items in cart · Product subtotal {preview.totalMinor===null?"Incomplete":money(preview.totalMinor)}</p>
              {catalogLoading && (
                <p role="status">Loading this Store’s catalog…</p>
              )}
              {!catalogLoading && slug && (
                <p className="manual-muted">
                  {products.length} menu items · {sets.length} sets ·{" "}
                  {privateItems.length} private items available
                </p>
              )}
              {!catalogLoading && slug && !products.length && !sets.length && (
                <p role="status">
                  No available menu items for this Store. Add a Custom Item or
                  make products available in Store management.
                </p>
              )}
              <fieldset disabled={busy || !slug} className="manual-grid mt-4">
                <legend className="font-bold">Choose an item to add</legend>
                <label>
                  Menu / weekly plan
                  <select
                    aria-label="Add menu item"
                    className={input}
                    value=""
                    onChange={(e) => {
                      const p = products.find((p) => p.id === e.target.value);
                      if (p) add({ productId: p.id, selectedOptions: [] });
                    }}
                  >
                    <option value="">Add menu / weekly plan…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.price.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
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
                    {sets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="manual-secondary"
                  onClick={() => add(undefined, { name: "", unitPrice: 0 })}
                >
                  Add Custom Item
                </button>
                <label>
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
                    {privateItems.map((p, i) => (
                      <option key={i} value={i}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            </section>
            {!draft.lines.length && (
              <p className="manual-section">
                Your order is empty. Choose a menu item, set or Custom Item
                above. Items use the main fulfilment schedule unless you choose an override.
              </p>
            )}
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
                          date: line.date,
                          meal: resolveHealthyLunchDay(
                            plan,
                            posProducts,
                            line.date,
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
                  className="manual-section manual-fields"
                >
                  <legend className="font-bold">
                    {line.custom
                      ? "Custom Item"
                      : product?.name || set?.name || "Item"}
                  </legend>
                  <p className="manual-muted">
                    Unit: {money(preview.rows[i].unitMinor)} · Subtotal:{" "}
                    {preview.rows[i].totalMinor === null
                      ? "Complete item"
                      : money(preview.rows[i].totalMinor!)}
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
                  <label>
                    Quantity{" "}
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
                          ...(line.selection?.healthyLunchDate
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
                  {plan?.productType === "weekly_meal_plan" && (
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
            <section
              className="manual-summary"
              aria-label="Daily order summary"
            >
              <h3>3. Cart &amp; Order Summary</h3>
              {!preview.days.length && (
                <p className="manual-muted">
                  Your daily allocations and subtotals will appear here.
                </p>
              )}
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
                          : money(entry.amountMinor)}
                      </span>
                    </div>
                  ))}
                  <div className="manual-summary-row">
                    <strong>Day subtotal</strong>
                    <strong>
                      {day.entries.some((e) => e.amountMinor === null)
                        ? "Incomplete"
                        : money(day.totalMinor)}
                    </strong>
                  </div>
                </div>
              ))}
              {hasStoreDelivery && <fieldset className="manual-section">
                <legend>Delivery fee</legend>
                <label>Fee source<select value={feeMode} disabled={busy || quoting} onChange={e => setFeeMode(e.target.value as 'estimate' | 'manual')}>
                  <option value="estimate">Lalamove estimate</option>{posFullAccess && <option value="manual">Agreed / manual fee</option>}
                </select></label>
                {feeMode === 'estimate' ? <>
                  <button type="button" disabled={busy || quoting} onClick={() => void quoteDelivery()}>{quoting ? 'Estimating…' : 'Refresh delivery estimate'}</button>
                  {usableQuote ? <p role="status">Customer charge {money(Math.round(usableQuote.customerDeliveryFee * 100))} · provider cost {money(Math.round(usableQuote.providerDeliveryFee * 100))}. Expires {new Date(usableQuote.expiresAt).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })} MYT.</p> : <p>Refresh after changing items, addresses or schedules.</p>}
                </> : <>
                  <label>Customer delivery charge<input type="number" min="0" max="100000" step="0.01" value={draft.deliveryFeeOverride?.amount ?? ''} onChange={e => setDraft({ ...draft, deliveryFeeOverride: { amount: e.target.value === '' ? NaN : Number(e.target.value), reason: draft.deliveryFeeOverride?.reason || '' } })} /></label>
                  <label>Audit reason / agreed fee reference<input maxLength={240} value={draft.deliveryFeeOverride?.reason || ''} onChange={e => setDraft({ ...draft, deliveryFeeOverride: { amount: draft.deliveryFeeOverride?.amount ?? NaN, reason: e.target.value } })} /></label>
                </>}
              </fieldset>}
              <div className="manual-summary-row"><span>Product subtotal</span><span>{preview.totalMinor === null ? 'Incomplete' : money(preview.totalMinor)}</span></div>
              <div className="manual-summary-row"><span>Delivery charge</span><span>{deliveryFee === undefined ? 'Estimate required' : money(Math.round(deliveryFee * 100))}</span></div>
              <div className="manual-summary-row"><span>Discounts</span><span>{money(0)}</span></div>
              <div className="manual-total">
                <span>Grand total</span>
                <span>
                  {preview.totalMinor === null
                    ? "Complete item options"
                    : deliveryFee === undefined || !Number.isFinite(deliveryFee) ? "Complete delivery fee" : money(preview.totalMinor + Math.round(deliveryFee * 100))}
                </span>
              </div>
              <p className="manual-muted">
                Preview uses current catalog prices. The server validates the
                final saved amount. Weekly package prices are allocated across
                five days for this summary.
              </p>
              <h3 className="mt-4">4. Payment &amp; Confirmation</h3>
              <span className="manual-badge">Pending Payment</span>
              <p className="manual-muted">
                Saving does not confirm payment. After saving, use Pending
                Manual Payments → Confirm Payment. Paid / Confirmed means funds
                received and eligible for preparation.
              </p>
            </section>
            {error && <p role="alert">{error}</p>}
            <div className="manual-actions">
              <button
                disabled={
                  busy ||
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
          </section>
        </div>
      )}
      {pay && (
        <div className="manual-overlay" style={{ zIndex: 120 }}>
          <section
            role="dialog"
            aria-modal="true"
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
            {error && <p role="alert">{error}</p>}
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
