import { createHash, randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { hasActiveBusinessEntitlement } from "./subscriptionFoundation.js";
import {
  normalizePromotionCode,
  validatePromotionCodeConfig,
  assertPromotionCodeEligible,
  malaysiaPromotionDay,
} from "./promotionCodePricing.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new HttpsError("failed-precondition", `Promotion code: ${message}`);
};
export const codeIndexId = (storeId, code) =>
  hash(`${storeId}:${normalizePromotionCode(code)}`);
export const codeDayId = (codeId, memberUid, day) =>
  hash(`${codeId}:${memberUid}:${day}`);
export const verifiedPromotionMember = (auth) =>
  auth?.uid && auth.token?.firebase?.sign_in_provider !== "anonymous"
    ? auth.uid
    : "";
const manager = async (db, uid, workspaceId) => {
  if (!uid || !workspaceId)
    throw new HttpsError(
      "permission-denied",
      "Store management access is required.",
    );
  const [workspace, membership] = await Promise.all([
    db.collection("workspaces").doc(workspaceId).get(),
    db.collection("workspaceMembers").doc(`${workspaceId}_${uid}`).get(),
  ]);
  const member = membership.data();
  const data = workspace.data();
  if (
    !workspace.exists ||
    !hasActiveBusinessEntitlement(data) ||
    !(
      data.ownerId === uid ||
      (member?.status === "Active" &&
        ["Owner", "Manager"].includes(member.role))
    )
  )
    throw new HttpsError(
      "permission-denied",
      "Store management access is required.",
    );
};
export const managePromotionCodes = async ({
  db,
  uid,
  input = {},
  now = new Date(),
}) => {
  const workspaceId = String(input.workspaceId || "").trim();
  await manager(db, uid, workspaceId);
  if (input.action === "list") {
    const snapshot = await db
      .collection("storePromotionCodes")
      .where("storeId", "==", workspaceId)
      .get();
    return {
      codes: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    };
  }
  if (input.action === "history") {
    const code = await db
      .collection("storePromotionCodes")
      .doc(String(input.id || ""))
      .get();
    if (code.data()?.storeId !== workspaceId)
      throw new HttpsError("permission-denied", "Code is outside this Store.");
    const snapshot = await code.ref
      .collection("redemptions")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const redemptions = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const row = { id: doc.id, ...doc.data() };
        if (row.state !== "reserved") return row;
        const queue = await db
          .collection("storePromotionCodeReservations")
          .doc(doc.id)
          .get();
        return {
          ...row,
          requiresReview: queue.data()?.requiresReview === true,
          lastCheckedAt: queue.data()?.lastCheckedAt || null,
        };
      }),
    );
    return { redemptions };
  }
  if (!["save", "disable"].includes(input.action))
    fail("Choose a valid management action.");
  const id = input.id || randomUUID();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) fail("Invalid code reference.");
  const reference = db.collection("storePromotionCodes").doc(id);
  return db.runTransaction(async (transaction) => {
    const previousSnapshot = await transaction.get(reference);
    const previous = previousSnapshot.data();
    if (previous && previous.storeId !== workspaceId)
      throw new HttpsError("permission-denied", "Code is outside this Store.");
    if (input.action === "disable" && !previous) fail("Code not found.");
    const value =
      input.action === "disable"
        ? { ...previous, active: false }
        : { ...input.config, code: normalizePromotionCode(input.config?.code) };
    const config = {
      id,
      storeId: workspaceId,
      code: value.code,
      active: value.active,
      membersOnly: value.membersOnly,
      percentageBps: value.percentageBps,
      capMinor: value.capMinor,
      dailyLimit: value.dailyLimit,
      totalLimit: value.totalLimit ?? null,
      startsAt: value.startsAt,
      endsAt: value.endsAt ?? null,
    };
    const error = validatePromotionCodeConfig(config);
    if (error) fail(error);
    const indexRef = db
      .collection("storePromotionCodeIndex")
      .doc(codeIndexId(workspaceId, config.code));
    const index = await transaction.get(indexRef);
    if (index.exists && index.data().codeId !== id)
      fail("This Store already has that code.");
    const oldIndexRef =
      previous && previous.code !== config.code
        ? db
            .collection("storePromotionCodeIndex")
            .doc(codeIndexId(workspaceId, previous.code))
        : null;
    const oldIndex = oldIndexRef ? await transaction.get(oldIndexRef) : null;
    const saved = {
      ...config,
      revision: (previous?.revision || 0) + 1,
      redeemedCount: previous?.redeemedCount || 0,
      reservedCount: previous?.reservedCount || 0,
      createdBy: previous?.createdBy || uid,
      createdAt: previous?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      updatedBy: uid,
    };
    if (
      config.totalLimit !== null &&
      config.totalLimit < saved.redeemedCount + saved.reservedCount
    )
      fail("Total limit cannot be below committed and reserved redemptions.");
    transaction.set(reference, saved);
    transaction.set(indexRef, { codeId: id, storeId: workspaceId });
    if (oldIndex?.data()?.codeId === id) transaction.delete(oldIndexRef);
    transaction.create(reference.collection("changes").doc(), {
      config: saved,
      actorUid: uid,
      createdAt: now.toISOString(),
    });
    return { code: saved };
  });
};
export const readCheckoutCode = async ({
  db,
  transaction,
  storeId,
  code,
  memberUid,
  now = new Date(),
  currency = "MYR",
  orderId = "",
}) => {
  if (!code) return null;
  const normalized = normalizePromotionCode(code);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(normalized))
    fail("This code is invalid.");
  const get = (reference) =>
    transaction ? transaction.get(reference) : reference.get();
  const index = await get(
    db
      .collection("storePromotionCodeIndex")
      .doc(codeIndexId(storeId, normalized)),
  );
  if (!index.exists) fail("This code is invalid or unavailable.");
  const reference = db
    .collection("storePromotionCodes")
    .doc(index.data().codeId);
  const snapshot = await get(reference);
  const config = snapshot.data();
  if (!config || config.storeId !== storeId || config.code !== normalized)
    fail("This code is invalid or unavailable.");
  assertPromotionCodeEligible({ config, memberUid, now, currency });
  const businessDate = malaysiaPromotionDay(now);
  const memberReference = memberUid
    ? db
        .collection("storePromotionCodeMembers")
        .doc(hash(`${config.id}:${memberUid}`))
    : null;
  const memberSnapshot = memberReference ? await get(memberReference) : null;
  if (memberSnapshot?.data()?.pendingOrderId)
    fail(
      "An unpaid code checkout is already reserved for this member. Complete or cancel it before using another code checkout.",
    );
  const dayReference = memberUid
    ? db
        .collection("storePromotionCodeDays")
        .doc(codeDayId(config.id, memberUid, businessDate))
    : null;
  const daySnapshot = dayReference ? await get(dayReference) : null;
  const day = daySnapshot?.data() || { committed: 0, reserved: 0 };
  if (memberUid && day.committed + day.reserved >= config.dailyLimit)
    fail(
      "Your daily limit is used or reserved by an unpaid checkout. Complete or cancel that checkout, or try again after 12:00 AM Malaysia time.",
    );
  if (
    config.totalLimit !== null &&
    config.redeemedCount + config.reservedCount >= config.totalLimit
  )
    fail("This code has reached its total redemption limit.");
  const redemptionReference = orderId
    ? reference.collection("redemptions").doc(orderId)
    : null;
  const existing = redemptionReference ? await get(redemptionReference) : null;
  if (existing?.exists) fail("This checkout already reserved the code.");
  return {
    db,
    config,
    reference,
    dayReference,
    day,
    memberReference,
    memberUid: memberUid || "",
    businessDate,
    redemptionReference,
    orderId,
    now,
  };
};
export const writeCodeReservation = (
  transaction,
  reservation,
  pricingSnapshot,
  recovery = {},
) => {
  if (!reservation) return;
  const {
    config,
    reference,
    dayReference,
    day,
    memberReference,
    memberUid,
    businessDate,
    redemptionReference,
    orderId,
    now,
  } = reservation;
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  transaction.update(reference, { reservedCount: config.reservedCount + 1 });
  if (memberReference)
    transaction.set(memberReference, {
      codeId: config.id,
      memberUid,
      storeId: config.storeId,
      pendingOrderId: orderId,
    });
  if (dayReference)
    transaction.set(dayReference, {
      codeId: config.id,
      storeId: config.storeId,
      memberUid,
      businessDate,
      committed: day.committed,
      reserved: day.reserved + 1,
    });
  transaction.create(redemptionReference, {
    orderId,
    codeId: config.id,
    storeId: config.storeId,
    memberUid,
    businessDate,
    state: "reserved",
    createdAt: now.toISOString(),
    expiresAt,
    pricingSnapshot,
  });
  // Server-only work queue. A TTL never releases a slot while a gateway can charge.
  transaction.create(
    reservation.db.collection("storePromotionCodeReservations").doc(orderId),
    {
      orderId,
      codeId: config.id,
      storeId: config.storeId,
      state: "reserved",
      expiresAt,
      nextCheckAt: expiresAt,
      recovery,
    },
  );
};
// All reads happen before the returned writer: callers can perform their remaining
// order/notification reads and then commit payment + usage in the same transaction.
export const prepareCodeTransition = async ({
  db,
  transaction,
  order,
  nextState,
  reason = "",
  now = new Date(),
  paidAt,
}) => {
  const snapshot = order?.promotionCodeSnapshot;
  if (!snapshot) return () => {};
  const configReference = db
    .collection("storePromotionCodes")
    .doc(snapshot.codeId);
  const redemptionReference = configReference
    .collection("redemptions")
    .doc(order.id);
  const redemptionSnapshot = await transaction.get(redemptionReference);
  if (!redemptionSnapshot.exists)
    fail("Redemption audit record is missing; payment requires review.");
  const redemption = redemptionSnapshot.data();
  if (redemption.state === nextState || redemption.state === "committed")
    return () => {};
  if (redemption.state !== "reserved")
    fail("This code checkout has already been released.");
  const paidDate = nextState === "committed" ? new Date(paidAt) : now;
  if (
    nextState === "committed" &&
    (!Number.isFinite(paidDate.getTime()) ||
      paidDate.getTime() > now.getTime() + 5 * 60000 ||
      paidDate.getTime() < Date.parse(redemption.createdAt) - 5 * 60000)
  )
    fail(
      "A verified captured-payment timestamp is required before committing redemption.",
    );
  const successDay = malaysiaPromotionDay(paidDate);
  const configSnapshot = await transaction.get(configReference);
  const config = configSnapshot.data();
  const dayReference = redemption.memberUid
    ? db
        .collection("storePromotionCodeDays")
        .doc(
          codeDayId(
            snapshot.codeId,
            redemption.memberUid,
            redemption.businessDate,
          ),
        )
    : null;
  const daySnapshot = dayReference ? await transaction.get(dayReference) : null;
  const day = daySnapshot?.data();
  const successReference =
    dayReference &&
    successDay !== redemption.businessDate &&
    nextState === "committed"
      ? db
          .collection("storePromotionCodeDays")
          .doc(codeDayId(snapshot.codeId, redemption.memberUid, successDay))
      : null;
  const successSnapshot = successReference
    ? await transaction.get(successReference)
    : null;
  const success = successSnapshot?.data() || { committed: 0, reserved: 0 };
  const memberReference = redemption.memberUid
    ? db
        .collection("storePromotionCodeMembers")
        .doc(hash(`${snapshot.codeId}:${redemption.memberUid}`))
    : null;
  const memberSnapshot = memberReference
    ? await transaction.get(memberReference)
    : null;
  if (
    !config ||
    config.reservedCount < 1 ||
    (dayReference && (!day || day.reserved < 1)) ||
    (memberReference && memberSnapshot?.data()?.pendingOrderId !== order.id)
  )
    fail("Redemption counters require review.");
  // One outstanding checkout across days prevents a delayed capture from racing
  // a new day's redemption. Success is attributed to gateway payment time.
  if (
    nextState === "committed" &&
    dayReference &&
    (successReference ? success.committed : day.committed) >=
      snapshot.dailyLimit
  )
    fail("Captured redemption requires review against the daily limit.");
  return () => {
    transaction.update(configReference, {
      reservedCount: config.reservedCount - 1,
      redeemedCount: config.redeemedCount + (nextState === "committed" ? 1 : 0),
    });
    if (dayReference)
      transaction.update(dayReference, {
        reserved: day.reserved - 1,
        committed:
          day.committed +
          (nextState === "committed" && !successReference ? 1 : 0),
      });
    if (successReference)
      transaction.set(successReference, {
        codeId: snapshot.codeId,
        storeId: redemption.storeId,
        memberUid: redemption.memberUid,
        businessDate: successDay,
        reserved: success.reserved,
        committed: success.committed + 1,
      });
    if (memberReference)
      transaction.update(memberReference, { pendingOrderId: null });
    transaction.update(redemptionReference, {
      state: nextState,
      reason,
      ...(nextState === "committed"
        ? {
            reservationBusinessDate: redemption.businessDate,
            businessDate: successDay,
            paidAt: paidDate.toISOString(),
          }
        : {}),
      updatedAt: now.toISOString(),
    });
    transaction.update(
      db.collection("storePromotionCodeReservations").doc(order.id),
      { state: nextState, updatedAt: now.toISOString() },
    );
    transaction.create(configReference.collection("redemptionEvents").doc(), {
      orderId: order.id,
      from: "reserved",
      to: nextState,
      reason,
      ...(nextState === "committed"
        ? { businessDate: successDay, paidAt: paidDate.toISOString() }
        : {}),
      createdAt: now.toISOString(),
    });
  };
};
