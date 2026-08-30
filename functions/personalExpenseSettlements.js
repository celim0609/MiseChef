import { HttpsError } from 'firebase-functions/v2/https';
import { requireWorkspaceFeature } from './subscriptionFoundation.js';

const readString = value => typeof value === 'string' ? value.trim() : '';
const readNumber = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const recordPersonalExpenseSettlement = async ({
  db,
  requesterId,
  workspaceId,
  memberId,
  amount,
  resolveWorkspaceAccess = ({ db: firestore, uid, workspaceId: id }) => requireWorkspaceFeature({
    db: firestore,
    uid,
    workspaceId: id,
    feature: 'finance'
  }),
  now = () => new Date()
}) => {
  const normalizedMemberId = readString(memberId);
  const amountCents = Math.round(readNumber(amount) * 100);
  const access = await resolveWorkspaceAccess({ db, uid: requesterId, workspaceId });
  if (!['Owner', 'Manager'].includes(access.role)) {
    throw new HttpsError('permission-denied', 'Only a workspace Owner or Manager can record repayments.');
  }
  if (!normalizedMemberId || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new HttpsError('invalid-argument', 'Enter a payment amount greater than zero.');
  }

  const memberReference = db.collection('workspaceMembers').doc(normalizedMemberId);
  const expenseQuery = db.collection('personalExpenses')
    .where('workspaceId', '==', access.workspaceId)
    .where('memberId', '==', normalizedMemberId);
  const settlementQuery = db.collection('personalExpenseSettlements')
    .where('workspaceId', '==', access.workspaceId)
    .where('memberId', '==', normalizedMemberId);
  const settlementReference = db.collection('personalExpenseSettlements').doc();
  const timestamp = now().toISOString();
  let remainingCents = 0;

  await db.runTransaction(async transaction => {
    const [memberSnapshot, expenseSnapshot, settlementSnapshot] = await Promise.all([
      transaction.get(memberReference),
      transaction.get(expenseQuery),
      transaction.get(settlementQuery)
    ]);
    const member = memberSnapshot.data() || {};
    if (!memberSnapshot.exists || member.workspaceId !== access.workspaceId) {
      throw new HttpsError('not-found', 'Workspace member not found.');
    }
    const expenseCents = expenseSnapshot.docs.reduce((sum, item) => sum + Math.round(readNumber(item.data().amount) * 100), 0);
    const settledCents = settlementSnapshot.docs.reduce((sum, item) => sum + Math.round(readNumber(item.data().amount) * 100), 0);
    const outstandingCents = Math.max(0, expenseCents - settledCents);
    if (amountCents > outstandingCents) {
      throw new HttpsError('failed-precondition', 'Payment cannot exceed the member’s outstanding balance.', {
        outstanding: outstandingCents / 100
      });
    }
    remainingCents = outstandingCents - amountCents;
    transaction.create(settlementReference, {
      id: settlementReference.id,
      workspaceId: access.workspaceId,
      memberId: normalizedMemberId,
      amount: amountCents / 100,
      settledAt: timestamp,
      createdBy: requesterId,
      createdAt: timestamp
    });
  });

  return {
    settlement: {
      id: settlementReference.id,
      workspaceId: access.workspaceId,
      memberId: normalizedMemberId,
      amount: amountCents / 100,
      settledAt: timestamp,
      createdBy: requesterId,
      createdAt: timestamp
    },
    outstanding: remainingCents / 100
  };
};
