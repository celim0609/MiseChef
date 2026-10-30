import "./manualPosOrders.css";
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
}: {
  workspaceId: string;
  storeId: string;
  country?: "MY" | "SG";
  storeName?: string;
  canRecordReminders?: boolean;
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
  const [manualOrders, setManualOrders] = useState<StoreOrder[]>([]);
  const pending = manualOrders.filter(
    (order) => order.payment.status === "pending",
  );
  const paid = manualOrders.filter((order) => order.payment.status === "paid");
  const posProducts = posFullAccess ? products.map((product) => ({ ...product, available: true })) : products;
  const preview = previewManualLines(draft.lines, posProducts, sets, groups, posFullAccess);
  const money = (minor: number) => `${currency} ${(minor / 100).toFixed(2)}`;
  const [slug, setSlug] = useState("");
  const [saved, setSaved] = useState<StoreOrder | null>(null);
  const [editing, setEditing] = useState<StoreOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  const load = async (order?: StoreOrder) => {
    setError("");
    setBusy(true);
    setCatalogLoading(true);
    setOpen(true);
    setDraft(
      order ? (structuredClone(order.manualOrder!.draft) as Draft) : empty(),
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
        order ? (structuredClone(order.manualOrder!.draft) as Draft) : empty(),
      );
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
  const add = (
    selection?: Partial<CartSelection>,
    custom?: Line["custom"],
    notes = "",
  ) =>
    setDraft((d) => ({
      ...d,
      lines: [
        ...d.lines,
        {
          quantity: 1,
          date: defaultDate,
          time: defaultTime,
          method: "pickup",
          deliveryAddress: "",
          notes,
          ...(selection ? { selection } : {}),
          ...(custom ? { custom } : {}),
        },
      ],
    }));
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
      const result = await storeOrderService.saveManualPosOrder({
        ...draft,
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
            <p className="manual-muted">
              Save as Pending Payment. Confirm only after payment is actually
              received. Preorders start tomorrow; immediate Walk-in stays
              available under Add Order. Delivery here is arranged by the
              customer.
            </p>
            <fieldset disabled={busy} className="manual-section manual-grid">
              <legend>1. Customer</legend>
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
            </fieldset>
            <section className="manual-section">
              <h3>2. Schedule &amp; items</h3>
              <p className="manual-muted">
                All dates and times are Malaysia time (UTC+8). Set defaults for
                new items, then adjust each item below. Changing defaults does
                not move existing items.
              </p>
              <div className="manual-grid">
                <label>
                  Default fulfilment date
                  <input
                    type="date"
                    min={shiftDateKey(toMalaysiaDateKey(), 1)}
                    value={defaultDate}
                    onChange={(e) => setDefaultDate(e.target.value)}
                  />
                </label>
                <label>
                  Default pickup / delivery time
                  <input
                    type="time"
                    step="1800"
                    value={defaultTime}
                    onChange={(e) => setDefaultTime(e.target.value)}
                  />
                </label>
              </div>
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
                above. Each item gets its own date, time, quantity and notes.
              </p>
            )}
            {draft.lines.map((line, i) => {
              const product = products.find(
                (p) => p.id === line.selection?.productId,
              );
              const set = sets.find((s) => s.id === line.selection?.setId);
              const plan =
                products.find(
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
                            products,
                            line.date,
                          ),
                        },
                      ]
                    : getWeeklyDates(line.date).map((date, index) => ({
                        date,
                        meal: resolvePlanMeal(
                          plan,
                          products,
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
                  <label>
                    {plan?.productType === "weekly_meal_plan" &&
                    !line.selection?.healthyLunchDate
                      ? "Start Monday (5 days)"
                      : "Fulfilment date"}{" "}
                    <input
                      className={input}
                      type="date"
                      min={shiftDateKey(toMalaysiaDateKey(), 1)}
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
                  <label>
                    Time{" "}
                    <input
                      className={input}
                      type="time"
                      step="1800"
                      value={line.time}
                      onChange={(e) => update(i, { time: e.target.value })}
                    />
                  </label>
                  <label>
                    Mode{" "}
                    <select
                      className={input}
                      value={line.method}
                      onChange={(e) => update(i, { method: e.target.value })}
                    >
                      <option value="pickup">Pickup</option>
                      <option value="delivery">
                        Customer-arranged delivery
                      </option>
                    </select>
                  </label>
                  {line.method === "delivery" && (
                    <label>
                      Delivery address{" "}
                      <input
                        className={input}
                        value={line.deliveryAddress}
                        onChange={(e) =>
                          update(i, { deliveryAddress: e.target.value })
                        }
                      />
                    </label>
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
              <h3>3. Daily summary &amp; payment</h3>
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
              <div className="manual-total">
                <span>Grand total</span>
                <span>
                  {preview.totalMinor === null
                    ? "Complete item options"
                    : money(preview.totalMinor)}
                </span>
              </div>
              <p className="manual-muted">
                Preview uses current catalog prices. The server validates the
                final saved amount. Weekly package prices are allocated across
                five days for this summary.
              </p>
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
                  preview.totalMinor <= 0
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
