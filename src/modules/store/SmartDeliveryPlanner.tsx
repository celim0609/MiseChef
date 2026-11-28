import React, { useEffect, useRef, useState } from "react";
import {
  smartDeliveryService as api,
  type PlannerLimits,
  type PlannerDestination,
  type PlannerDraft,
  type PlannerComparison,
  type PlannerPreview,
} from "./services/smartDeliveryService";
const defaults: PlannerLimits = {
  distanceKm: 2,
  slotMinutes: 30,
  maxDestinations: 5,
  maxDurationMinutes: 60,
  legMinutes: 10,
  serviceMinutes: 2,
};
const money = (minor: number) => `RM${(minor / 100).toFixed(2)}`;
const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};
const endTime = (start: string, slot: number) => {
  const [h, m] = start.split(":").map(Number),
    v = Math.min(1439, h * 60 + m + slot);
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Please retry.";
export function SmartDeliveryResults({
  result,
  now,
}: {
  result: PlannerComparison;
  now: number;
}) {
  const expired = Date.parse(result.expiresAt) <= now;
  const [selected, setSelected] = useState(result.routes.length - 1);
  const [kind, setKind] = useState<"manual" | "optimized">("manual");
  const route = result.routes[selected] || result.routes.at(-1)!;
  const selectedKind =
    kind === "optimized" && route.optimized ? "optimized" : "manual";
  const chosen = selectedKind === "optimized" ? route.optimized! : route.manual;
  const policy = result.pricingPolicy;
  const policyLabel =
    policy?.status === "applied"
      ? "Existing Store policy applied once per route"
      : policy?.status === "missing"
        ? "No fixed-buffer policy configured for this Beta Store"
        : policy?.status === "disabled"
          ? "Fixed-buffer policy disabled in Store Settings"
          : policy?.status === "vehicle_not_applicable"
            ? "Fixed-buffer policy does not apply to this vehicle/service"
            : policy?.status === "invalid"
              ? "Stored fixed-buffer policy is invalid; no policy applied"
              : "Policy details unavailable for this comparison";
  const status = (q: PlannerPreview) =>
    expired
      ? "Expired · refresh comparison"
      : !q.timing.feasible
        ? "Rejected · assumption-based schedule misses a window or duration limit"
        : !q.economical
          ? "Rejected · no net customer saving"
          : "Eligible for internal review · preview only";
  const maximum = (q: PlannerPreview) =>
    policy?.status === "applied"
      ? money(q.maximumExtraCostMinor)
      : policy?.status === "missing"
        ? "Not configured"
        : policy
          ? "Not active"
          : money(q.maximumExtraCostMinor);
  const metrics: Array<[string, (q: PlannerPreview) => React.ReactNode]> = [
    ["Individual provider costs", () => money(route.individualTotalMinor)],
    ["Combined provider quote", (q) => money(q.feeMinor)],
    ["One applicable route buffer", (q) => money(q.bufferMinor)],
    ["Proposed delivery fees", (q) => money(q.totalMinor)],
    ["Provider cost saving", (q) => money(q.providerSavingsMinor)],
    ["Customer saving after buffer¹", (q) => money(q.savingsMinor)],
    [
      "Projected merchant exposure / subsidy",
      (q) => `${money(q.merchantExposureMinor)} / RM0.00`,
    ],
    ["Maximum extra cost protection", maximum],
    ["Assumed total duration", (q) => `${q.timing.durationMinutes} min`],
    ["Review status", status],
  ];
  const destinations = result.draft.destinations.slice(0, route.count);
  return (
    <section aria-label="Smart Delivery comparison" className="smart-results">
      <div className="smart-section-heading">
        <h3>Quotation comparison</h3>
        <span
          role="status"
          className={expired ? "smart-warning" : "smart-muted"}
        >
          {expired
            ? "Expired · refresh comparison"
            : "Quotation available · preview only"}
        </span>
      </div>
      <p>{result.pricingNotice}</p>
      <div className="smart-table-wrap">
        <table aria-label="Incremental quotation comparison">
          <thead>
            <tr>
              <th>Stops</th>
              <th>Individual</th>
              <th>Manual route</th>
              <th>Added stop</th>
              <th>Optimized</th>
            </tr>
          </thead>
          <tbody>
            {result.routes.map((r, i) => (
              <tr key={r.count}>
                <td>
                  <button
                    aria-pressed={selected === i}
                    onClick={() => setSelected(i)}
                  >
                    {r.count} destination{r.count === 1 ? "" : "s"}
                  </button>
                </td>
                <td>{money(r.individualTotalMinor)}</td>
                <td>{money(r.manual.feeMinor)}</td>
                <td>{money(r.incrementalMinor)}</td>
                <td>{r.optimized ? money(r.optimized.feeMinor) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="smart-muted">
        {policyLabel}. Financial previews and customer charges are unchanged.
      </p>
      <div className="smart-table-wrap">
        <table
          aria-label="Manual and optimized route comparison"
          className="smart-route-comparison"
        >
          <thead>
            <tr>
              <th scope="col">Compare routes</th>
              <th scope="col">
                <button
                  aria-pressed={selectedKind === "manual"}
                  onClick={() => setKind("manual")}
                >
                  Select manual route
                </button>
              </th>
              <th scope="col">
                {route.optimized ? (
                  <button
                    aria-pressed={selectedKind === "optimized"}
                    onClick={() => setKind("optimized")}
                  >
                    Select optimized route
                  </button>
                ) : (
                  "Optimized · not available"
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value(route.manual)}</td>
                <td>{route.optimized ? value(route.optimized) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section
        className="smart-card smart-selected-route"
        aria-label="Selected route schedule and allocation"
      >
        <h3>Selected {selectedKind} route · schedule and fee preview</h3>
        <p className="smart-warning">
          Fixed-duration assumptions: {result.draft.limits.legMinutes} minutes
          per leg, {result.draft.limits.serviceMinutes} minutes per stop, plus
          waiting. These are not actual travel times or guaranteed arrival
          times.
        </p>
        <p className="smart-muted">
          Saved customer windows stay unchanged. Assumed total duration:{" "}
          {chosen.timing.durationMinutes} min.
        </p>
        <div className="smart-table-wrap">
          <table aria-label="Selected route delivery schedule and fee allocation">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Delivery window · MYT</th>
                <th>Assumed arrival · MYT</th>
                <th>Individual quote</th>
                <th>Proposed fee</th>
                <th>Saving¹</th>
              </tr>
            </thead>
            <tbody>
              {chosen.timing.arrivals.map((a) => {
                const i = destinations.findIndex((d) => d.id === a.id);
                return (
                  <tr key={a.id}>
                    <th scope="row">{a.label}</th>
                    <td>
                      {a.windowStart}–{a.windowEnd}
                    </td>
                    <td>
                      {a.arrival}
                      {!a.withinWindow ? " · Outside window" : ""}
                    </td>
                    <td>{money(result.individual[i].feeMinor)}</td>
                    <td>{money(chosen.allocations[i])}</td>
                    <td>
                      {money(
                        result.individual[i].feeMinor - chosen.allocations[i],
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <details className="smart-quote-details">
        <summary>Quotation IDs, expiry and technical evidence</summary>
        <p>
          Comparison expires{" "}
          {new Date(result.expiresAt).toLocaleString("en-MY", {
            timeZone: "Asia/Kuala_Lumpur",
          })}{" "}
          MYT ·{" "}
          {expired
            ? "Expired"
            : `${Math.max(0, Math.floor((Date.parse(result.expiresAt) - now) / 1000))}s remaining`}
        </p>
        <p className="smart-muted">{result.arrivalBasis}</p>
        <p>
          Policy source: Store Settings → Delivery → Fixed Delivery Buffer.
          Status: {policy?.status || "unavailable"}
          {policy ? ` · Vehicle: ${policy.serviceType}` : ""}.
        </p>
        {policy && (
          <p>
            Stored buffer:{" "}
            {policy.configuredBufferMinor === null
              ? "Not configured"
              : money(policy.configuredBufferMinor)}{" "}
            · Stored maximum extra cost:{" "}
            {policy.configuredMaximumExtraCostMinor === null
              ? "Not configured"
              : money(policy.configuredMaximumExtraCostMinor)}
          </p>
        )}
        {(
          [
            ["Manual route", route.manual],
            ["Optimized route", route.optimized],
          ] as const
        ).map(
          ([title, q]) =>
            q && (
              <div key={title}>
                <strong>{title}</strong>
                <p className="smart-break">
                  Quotation ID: {q.quotationId} · Expires{" "}
                  {new Date(q.expiresAt).toLocaleTimeString("en-MY", {
                    timeZone: "Asia/Kuala_Lumpur",
                  })}{" "}
                  MYT
                </p>
                <p>
                  {q.providerOptimized
                    ? "Provider optimization confirmed"
                    : "Provider optimization not confirmed / manual sequence"}
                </p>
                <p className="smart-break">
                  Sequence:{" "}
                  {q.sequence
                    .map(
                      (id) =>
                        destinations.find((d) => d.id === id)?.label || id,
                    )
                    .join(" → ")}
                </p>
              </div>
            ),
        )}
        <h4>Individual quotation evidence</h4>
        {result.individual.slice(0, route.count).map((q, i) => (
          <p className="smart-break" key={i}>
            {destinations[i].label} · ID: {q.quotationId} · Expires{" "}
            {new Date(q.expiresAt).toLocaleTimeString("en-MY", {
              timeZone: "Asia/Kuala_Lumpur",
            })}{" "}
            MYT
          </p>
        ))}
      </details>
      <p className="smart-muted">
        ¹Compared with individual provider quotations before individual buffers
        or promotions. Actual paid fees are unchanged. Uneconomical or
        infeasible routes are rejected.
      </p>
    </section>
  );
}
export default function SmartDeliveryPlanner({
  storeId,
  workspaceId,
}: {
  storeId: string;
  workspaceId: string;
}) {
  const [draft, setDraft] = useState<PlannerDraft>({
    date: tomorrow(),
    pickupTime: "11:00",
    limits: defaults,
    destinations: [],
  });
  const [search, setSearch] = useState(""),
    [suggestions, setSuggestions] = useState<
      Array<{ placeId: string; label: string }>
    >([]),
    [orders, setOrders] = useState<PlannerDestination[]>([]),
    [result, setResult] = useState<PlannerComparison>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const session = useRef(crypto.randomUUID());
  const generation = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    generation.current++;
    setResult(undefined);
    setOrders([]);
    setDraft({
      date: tomorrow(),
      pickupTime: "11:00",
      limits: defaults,
      destinations: [],
    });
    return () => {
      generation.current++;
    };
  }, [storeId, workspaceId]);
  const change = (next: PlannerDraft) => {
    generation.current++;
    setDraft(next);
    setResult(undefined);
    setError("");
    setNotice("Plan changed. Request a fresh comparison.");
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const add = (d: PlannerDestination) => {
    if (draft.destinations.some((v) => v.id === d.id)) return;
    change({ ...draft, destinations: [...draft.destinations, d] });
    setSuggestions([]);
    setSearch("");
  };
  const update = (i: number, d: PlannerDestination) =>
    change({
      ...draft,
      destinations: draft.destinations.map((v, n) => (n === i ? d : v)),
    });
  const limitLabels: Array<[keyof PlannerLimits, string, number, number]> = [
    ["distanceKm", "Pairwise distance (km)", 0.1, 20],
    ["slotMinutes", "Default slot (min)", 5, 180],
    ["maxDestinations", "Maximum destinations", 1, 10],
    ["maxDurationMinutes", "Maximum route (min)", 5, 240],
    ["legMinutes", "Assumed travel per leg (min)", 1, 60],
    ["serviceMinutes", "Service per stop (min)", 0, 30],
  ];
  return (
    <main className="smart-planner">
      <div className="smart-section-heading">
        <h2>Smart Delivery Planner</h2>
        <span className="smart-badge">Beta · Sandbox · Owner/Manager</span>
      </div>
      <p className="smart-muted">
        Plan nearby deliveries and compare provider quotations. No minimum meal
        quantity. Quotes and fee allocations are previews; customer charges stay
        unchanged.
      </p>
      <fieldset disabled={busy}>
        <div className="smart-toolbar">
          <label>
            Delivery date
            <input
              aria-label="Planner delivery date"
              type="date"
              value={draft.date}
              onChange={(e) => {
                change({
                  ...draft,
                  date: e.target.value,
                  destinations: draft.destinations.filter((d) => !d.orderId),
                });
                setOrders([]);
              }}
            />
          </label>
          <label>
            Kitchen pickup time · MYT
            <input
              type="time"
              value={draft.pickupTime}
              onChange={(e) => change({ ...draft, pickupTime: e.target.value })}
            />
          </label>
          <details className="smart-settings">
            <summary>Planning limits</summary>
            <div className="smart-limits">
              {limitLabels.map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    step={key === "distanceKm" ? 0.1 : 1}
                    value={draft.limits[key]}
                    onChange={(e) => {
                      change({
                        ...draft,
                        limits: {
                          ...draft.limits,
                          [key]: Number(e.target.value),
                        },
                      });
                      setOrders([]);
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="smart-muted">
              Slot changes apply to new manual destinations. Saved exact
              delivery times remain strict constraints and cannot be edited. Up
              to 10 destinations per comparison keeps the Sandbox request batch
              below 30 quotations.
            </p>
          </details>
        </div>
        <div className="smart-entry-grid">
          <section className="smart-card">
            <h3>Manual address</h3>
            <div className="smart-inline">
              <label className="smart-grow">
                Search Malaysian address
                <input
                  value={search}
                  placeholder="Street, building or postcode"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSuggestions([]);
                  }}
                />
              </label>
              <button
                disabled={
                  search.trim().length < 3 ||
                  draft.destinations.length >= draft.limits.maxDestinations
                }
                onClick={() =>
                  void run(async () => {
                    const r = await api.search(
                      storeId,
                      workspaceId,
                      search,
                      session.current,
                    );
                    setSuggestions(r.suggestions);
                  })
                }
              >
                Search
              </button>
            </div>
            {suggestions.map((s) => (
              <button
                className="smart-suggestion"
                key={s.placeId}
                onClick={() =>
                  add({
                    id: crypto.randomUUID(),
                    label: s.label.slice(0, 120),
                    placeId: s.placeId,
                    address: s.label,
                    windowStart: draft.pickupTime,
                    windowEnd: endTime(
                      draft.pickupTime,
                      draft.limits.slotMinutes,
                    ),
                  })
                }
              >
                {s.label}
              </button>
            ))}
          </section>
          <section className="smart-card">
            <h3>Existing delivery orders</h3>
            <button
              onClick={() =>
                void run(async () => {
                  const r = await api.orders(
                    storeId,
                    workspaceId,
                    draft.date,
                    draft.limits,
                  );
                  setOrders(r.destinations);
                  setNotice(
                    r.truncated
                      ? "Showing eligible deliveries from the first 100 Store orders. This list is incomplete."
                      : "Eligible deliveries loaded for the selected date.",
                  );
                })
              }
            >
              Load delivery orders
            </button>
            <select
              aria-label="Add existing delivery"
              value=""
              disabled={
                draft.destinations.length >= draft.limits.maxDestinations
              }
              onChange={(e) => {
                const d = orders.find((o) => o.id === e.target.value);
                if (d) add(d);
              }}
            >
              <option value="">Choose a saved delivery…</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} · {o.confirmedTime} · {o.address}
                </option>
              ))}
            </select>
            <p className="smart-muted">
              Saved exact time is a strict constraint. The planner will reject a
              route that misses it.
            </p>
          </section>
        </div>
        <section className="smart-card">
          <div className="smart-section-heading">
            <h3>
              Destinations · {draft.destinations.length}/
              {draft.limits.maxDestinations}
            </h3>
            <span className="smart-muted">
              Manual sequence · maximum pairwise {draft.limits.distanceKm}km
            </span>
          </div>
          {!draft.destinations.length && (
            <p className="smart-muted">
              Add mapped addresses or saved delivery fulfilments to start.
            </p>
          )}
          {draft.destinations.map((d, i) => (
            <div className="smart-destination" key={d.id}>
              <div>
                <label>
                  Destination {i + 1}
                  <input
                    value={d.label}
                    maxLength={120}
                    disabled={Boolean(d.orderId)}
                    onChange={(e) => update(i, { ...d, label: e.target.value })}
                  />
                </label>
                <p className="smart-muted smart-break">{d.address}</p>
                {d.confirmedTime && (
                  <strong>
                    Saved exact time: {d.confirmedTime} MYT · unchanged
                  </strong>
                )}
              </div>
              <label>
                Window start
                <input
                  type="time"
                  value={d.windowStart}
                  disabled={Boolean(d.orderId)}
                  onChange={(e) =>
                    update(i, { ...d, windowStart: e.target.value })
                  }
                />
              </label>
              <label>
                Window end
                <input
                  type="time"
                  value={d.windowEnd}
                  disabled={Boolean(d.orderId)}
                  onChange={(e) =>
                    update(i, { ...d, windowEnd: e.target.value })
                  }
                />
              </label>
              <div className="smart-inline">
                <button
                  aria-label={`Move destination ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => {
                    const destinations = [...draft.destinations];
                    [destinations[i - 1], destinations[i]] = [
                      destinations[i],
                      destinations[i - 1],
                    ];
                    change({ ...draft, destinations });
                  }}
                >
                  ↑
                </button>
                <button
                  aria-label={`Remove destination ${i + 1}`}
                  onClick={() =>
                    change({
                      ...draft,
                      destinations: draft.destinations.filter(
                        (v) => v.id !== d.id,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </section>
        <button
          className="smart-primary"
          disabled={!draft.destinations.length}
          onClick={() =>
            void run(async () => {
              setResult(undefined);
              const version = generation.current;
              const r = await api.compare(storeId, workspaceId, draft);
              if (version === generation.current) {
                setResult(r);
                setNotice(
                  "Fresh Sandbox comparison ready. No customer charges changed.",
                );
              }
            })
          }
        >
          {busy ? "Requesting quotations…" : "Compare Sandbox quotations"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="smart-warning">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="smart-muted">
          {notice}
        </p>
      )}
      {result && <SmartDeliveryResults result={result} now={now} />}
    </main>
  );
}
