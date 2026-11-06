import { mytInputValue, mytInputToIso } from "./promotionCodeDates";
import { useEffect, useState } from "react";
import { promotionCodeService } from "./services/promotionCodeService";
import type { CodeRedemption, PromotionCodeConfig } from "./promotionCodeTypes";
import { validatePromotionCodeConfig } from "../../../functions/promotionCodePricing.js";
const empty = (storeId: string): PromotionCodeConfig => ({
  id: "",
  storeId,
  code: "",
  active: true,
  membersOnly: true,
  percentageBps: 2000,
  capMinor: 500,
  dailyLimit: 1,
  totalLimit: null,
  startsAt: new Date().toISOString(),
  endsAt: null,
});
export default function StorePromotionCodesPanel({
  workspaceId,
  canManage,
}: {
  workspaceId: string;
  canManage: boolean;
}) {
  const [codes, setCodes] = useState<PromotionCodeConfig[]>([]);
  const [draft, setDraft] = useState<PromotionCodeConfig | null>(null);
  const [history, setHistory] = useState<{
    code: string;
    rows: CodeRedemption[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () =>
    promotionCodeService
      .list(workspaceId)
      .then((result) => setCodes(result.codes));
  useEffect(() => {
    void refresh().catch((error) => setError(error.message));
  }, [workspaceId]);
  const save = async () => {
    if (!draft || busy) return;
    const config = { ...draft, code: draft.code.trim().toUpperCase() };
    const message = validatePromotionCodeConfig(config);
    if (message) return setError(message);
    setBusy(true);
    setError("");
    try {
      await promotionCodeService.save(workspaceId, config);
      setDraft(null);
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = "mt-1 block w-full rounded-xl border p-3";
  return (
    <section
      aria-labelledby="promotion-codes-heading"
      className="mb-8 rounded-3xl border bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="promotion-codes-heading"
            className="text-xl font-bold text-primary"
          >
            Promotion Codes
          </h2>
          <p className="mt-1 text-sm">
            Member codes use Malaysia time and never replace or stack with a
            Weekly Discount.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(empty(workspaceId));
              setError("");
            }}
            className="rounded-full bg-primary px-5 py-3 font-bold text-on-primary"
          >
            Create Promotion Code
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-error">
          {error}
        </p>
      )}
      {draft && (
        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              Code
              <input
                aria-label="Promotion code"
                required
                maxLength={32}
                value={draft.code}
                onChange={(e) =>
                  setDraft({ ...draft, code: e.target.value.toUpperCase() })
                }
                className={field}
              />
            </label>
            <label>
              Percentage discount (%)
              <input
                aria-label="Code percentage"
                required
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={draft.percentageBps / 100}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    percentageBps: Math.round(Number(e.target.value) * 100),
                  })
                }
                className={field}
              />
            </label>
            <label>
              Maximum discount cap (RM)
              <input
                aria-label="Maximum discount cap"
                required
                type="number"
                min="0.01"
                max="100000"
                step="0.01"
                value={draft.capMinor / 100}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    capMinor: Math.round(Number(e.target.value) * 100),
                  })
                }
                className={field}
              />
            </label>
            <label>
              Per-member daily usage limit
              <input
                aria-label="Daily member limit"
                required
                type="number"
                min="1"
                max="100"
                step="1"
                value={draft.dailyLimit}
                onChange={(e) =>
                  setDraft({ ...draft, dailyLimit: Number(e.target.value) })
                }
                className={field}
              />
            </label>
            <label>
              Starts at (Malaysia time)
              <input
                aria-label="Code starts at"
                required
                type="datetime-local"
                value={mytInputValue(draft.startsAt)}
                onChange={(e) => {
                  if (e.target.value)
                    setDraft({
                      ...draft,
                      startsAt: mytInputToIso(e.target.value)!,
                    });
                }}
                className={field}
              />
            </label>
            <label>
              Expires at (Malaysia time, optional)
              <input
                aria-label="Code expires at"
                type="datetime-local"
                value={mytInputValue(draft.endsAt)}
                onChange={(e) =>
                  setDraft({ ...draft, endsAt: mytInputToIso(e.target.value) })
                }
                className={field}
              />
            </label>
            <label>
              Total successful redemptions (optional)
              <input
                aria-label="Total redemption limit"
                type="number"
                min="1"
                step="1"
                value={draft.totalLimit ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    totalLimit: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={field}
              />
            </label>
          </div>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={draft.membersOnly}
              onChange={(e) =>
                setDraft({ ...draft, membersOnly: e.target.checked })
              }
            />
            Members Only
          </label>
          <p className="text-sm">
            Daily limits use Firebase member identity and reset at 12:00 AM
            Asia/Kuala_Lumpur. Turning Members Only off allows guests;
            per-member limits then apply to signed-in members, while the total
            limit applies to everyone.
          </p>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Enabled
          </label>
          <p className="text-sm">
            Delivery fees are excluded. Codes require a supported online payment
            method. Unpaid reservations are released only after the gateway
            confirms cancellation or expiry.
          </p>
          <div className="flex gap-3">
            <button
              disabled={busy}
              className="rounded-full bg-primary px-5 py-3 font-bold text-on-primary"
            >
              {busy ? "Saving…" : "Save Code"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
              className="rounded-full border px-5 py-3"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <button
        type="button"
        onClick={() => void refresh().catch((error) => setError(error.message))}
        className="mt-4 text-sm underline"
      >
        Refresh usage
      </button>
      <div className="mt-5 space-y-3">
        {codes.map((code) => (
          <article
            key={code.id}
            className="rounded-xl bg-surface-container-low p-4"
          >
            <h3 className="font-bold">
              {code.code} · {code.active ? "Enabled" : "Disabled"}
            </h3>
            <p className="text-sm">
              {code.percentageBps / 100}% · max RM
              {(code.capMinor / 100).toFixed(2)} ·{" "}
              {code.membersOnly ? "Members only" : "Guests and members"} ·{" "}
              {code.dailyLimit}/member/MYT day
            </p>
            <p className="text-sm">
              Successful: {code.redeemedCount || 0}
              {code.totalLimit !== null ? ` / ${code.totalLimit}` : ""} ·
              Reserved: {code.reservedCount || 0}
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ ...code });
                      setError("");
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy || !code.active}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await promotionCodeService.disable(
                          workspaceId,
                          code.id,
                        );
                        await refresh();
                      } catch (error) {
                        setError((error as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Disable
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await promotionCodeService.history(
                      workspaceId,
                      code.id,
                    );
                    setHistory({ code: code.code, rows: result.redemptions });
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              >
                Usage & redemption history
              </button>
            </div>
          </article>
        ))}
      </div>
      {history && (
        <div className="mt-5 overflow-x-auto">
          <div className="flex justify-between">
            <h3 className="font-bold">
              {history.code} · latest 100 redemptions
            </h3>
            <button type="button" onClick={() => setHistory(null)}>
              Close history
            </button>
          </div>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr>
                <th>Order</th>
                <th>Member UID</th>
                <th>MYT day</th>
                <th>Status</th>
                <th>Discount</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2">{row.orderId}</td>
                  <td>{row.memberUid || "Guest"}</td>
                  <td>{row.businessDate}</td>
                  <td>
                    {row.state}
                    {row.requiresReview ? " · gateway review pending" : ""}
                  </td>
                  <td>
                    RM{(row.pricingSnapshot.discountMinor / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!history.rows.length && <p>No redemptions yet.</p>}
        </div>
      )}
    </section>
  );
}
