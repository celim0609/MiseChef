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

type Line = {
  quantity: number;
  date: string;
  time: string;
  method: string;
  deliveryAddress: string;
  notes: string;
  selection?: Partial<CartSelection>;
  custom?: { name: string; unitPrice: number; savePrivate?: boolean };
};
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
}: {
  workspaceId: string;
  storeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [sets, setSets] = useState<StoreSet[]>([]);
  const [groups, setGroups] = useState<StoreOptionGroup[]>([]);
  const [privateItems, setPrivateItems] = useState<
    Array<{ name: string; unitPrice: number; notes: string }>
  >([]);
  const [slug, setSlug] = useState("");
  const [pending, setPending] = useState<StoreOrder[]>([]);
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
  useEffect(
    () =>
      storeOrderService.subscribePendingManualOrders(
        storeId,
        workspaceId,
        setPending,
        (e) => setError(e.message),
      ),
    [storeId, workspaceId],
  );
  const load = async (order?: StoreOrder) => {
    setError("");
    setBusy(true);
    try {
      const [store, products, sets, groups, privateItems] = await Promise.all([
        storeService.getWorkspaceStore(workspaceId),
        storeService.listAdminProducts(workspaceId),
        storeService.listSets(workspaceId),
        storeService.listOptionGroups(workspaceId),
        storeOrderService.listPrivatePosItems(workspaceId),
      ]);
      setSlug(store?.slug || "");
      setProducts(products.filter((p) => p.available));
      setSets(sets.filter((s) => s.available));
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
          date: shiftDateKey(toMalaysiaDateKey(), 1),
          time: "12:00",
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
      className="m-4 rounded-xl border p-4"
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
        Pending manual payments ({pending.length})
      </h3>
      {pending.map((order) => (
        <article key={order.id} className="my-2 rounded border p-3">
          <b>
            {order.orderNumber} · {order.customerName}
          </b>
          <p>
            Pending Payment · {order.currency} {order.total.toFixed(2)}
          </p>
          <button
            disabled={busy}
            className="mr-4 underline"
            onClick={() => void load(order)}
          >
            Edit before payment
          </button>
          <button
            disabled={busy}
            className="underline"
            onClick={() => {
              setPay(order);
              setReceived(false);
              setReference("");
              setError("");
            }}
          >
            Confirm received payment
          </button>
        </article>
      ))}
      {saved && (
        <p role="status">
          {saved.orderNumber}:{" "}
          {saved.payment.status === "paid"
            ? "Paid · Confirmed"
            : "Pending Payment"}{" "}
          {saved.payment.status === "paid" && (
            <button
              className="underline"
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
          )}
        </p>
      )}
      {open && (
        <div className="fixed inset-0 z-[110] overflow-auto bg-black/60 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Create Manual Order"
            className="mx-auto max-w-4xl rounded-xl bg-white p-5 text-slate-950"
          >
            <h2 className="text-xl font-bold">
              {editing ? `Edit ${editing.orderNumber}` : "Create Manual Order"}
            </h2>
            <p>
              Save as Pending Payment. Confirm only after payment is actually
              received. Preorders start tomorrow; immediate Walk-in stays
              available under Add Order. Delivery here is arranged by the
              customer.
            </p>
            <fieldset disabled={busy} className="my-3 flex flex-wrap gap-3">
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
            <fieldset disabled={busy} className="my-3 flex flex-wrap gap-2">
              <legend className="font-bold">Menu and private items</legend>
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
                        products,
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
              <button
                className={input}
                onClick={() => add(undefined, { name: "", unitPrice: 0 })}
              >
                Add Custom Item
              </button>
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
            </fieldset>
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
                  className="my-3 flex flex-wrap gap-3 rounded border p-3"
                >
                  <legend className="font-bold">
                    {line.custom
                      ? "Custom Item"
                      : product?.name || set?.name || "Item"}
                  </legend>
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
                      max="20"
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
                  {product?.optionGroupIds.map((id) => {
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
                        {g.productIds.map((id) => (
                          <option key={id} value={id}>
                            {products.find((p) => p.id === id)?.name || id}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button
                    className="underline"
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
            {error && <p role="alert">{error}</p>}
            <button
              disabled={
                busy || !draft.lines.length || !draft.customerName.trim()
              }
              onClick={() => void save()}
              className="mr-4 rounded bg-blue-700 p-3 text-white"
            >
              {busy ? "Saving…" : "Save Pending Order"}
            </button>
            <button disabled={busy} onClick={() => setOpen(false)}>
              Close
            </button>
          </section>
        </div>
      )}
      {pay && (
        <div className="fixed inset-0 z-[120] bg-black/60 p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Confirm received payment"
            className="mx-auto max-w-lg rounded-xl bg-white p-5 text-slate-950"
          >
            <h2 className="text-xl font-bold">
              Confirm received payment · {pay.orderNumber}
            </h2>
            <p>
              {pay.currency} {pay.total.toFixed(2)} · One payment for all
              fulfilment days
            </p>
            <label>
              Method{" "}
              <select
                className={input}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {["bank_transfer", "cash", "tng", "other"].map((m) => (
                  <option key={m}>{m}</option>
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
            <p>Only Workspace Owner / Manager can confirm.</p>
            {error && <p role="alert">{error}</p>}
            <button
              disabled={busy || !received || !reference.trim()}
              className="mr-4 rounded bg-blue-700 p-3 text-white"
              onClick={() => void confirm()}
            >
              Confirm Paid
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
