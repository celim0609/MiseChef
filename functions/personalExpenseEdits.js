import { randomUUID } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { validatePersonalExpenseFields } from './personalExpenseFields.js';
import { hasActiveBusinessEntitlement, requireWorkspaceAccess } from './subscriptionFoundation.js';

const isDocumentId = value => typeof value === 'string'
  && value.length > 0 && value.length <= 500 && !value.includes('/')
  && value !== '.' && value !== '..' && !/^__.*__$/.test(value);

export const editPersonalExpense = async ({
  db,
  requesterId,
  workspaceId,
  expenseId,
  expectedVersion,
  draft,
  resolveWorkspaceAccess = requireWorkspaceAccess
}) => {
  const access = await resolveWorkspaceAccess({ db, uid: requesterId, workspaceId });
  if (!['Owner', 'Manager'].includes(access.role)) {
    throw new HttpsError('permission-denied', 'Only a workspace Owner or Manager can edit personal expenses.');
  }
  if (!hasActiveBusinessEntitlement(access.workspaceSnapshot.data())) {
    throw new HttpsError('permission-denied', 'A valid Business Workspace subscription is required.');
  }
  if (!isDocumentId(expenseId) || !(expectedVersion === '' || (typeof expectedVersion === 'string' && /^[a-f0-9-]{36}$/.test(expectedVersion)))) {
    throw new HttpsError('invalid-argument', 'Invalid personal expense or edit version.');
  }

  let updated;
  try {
    updated = validatePersonalExpenseFields(draft ?? {});
  } catch (error) {
    throw new HttpsError('invalid-argument', error.message);
  }
  if (!isDocumentId(updated.memberId)) {
    throw new HttpsError('invalid-argument', 'Choose a valid paying member.');
  }

  const expenseRef = db.collection('personalExpenses').doc(expenseId);
  const auditRef = expenseRef.collection('editHistory').doc(expectedVersion || 'original');
  const version = randomUUID();
  const editedAt = new Date().toISOString();

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(expenseRef);
    const expense = snapshot.data();
    if (!expense || expense.workspaceId !== access.workspaceId) {
      throw new HttpsError('not-found', 'Personal expense not found.');
    }

    const fields = Object.keys(updated);
    const audit = (await transaction.get(auditRef)).data();
    if (audit?.editedBy === requesterId && fields.every(field => audit.submitted[field] === updated[field])) return;

    if ((expense.editVersion ?? '') !== expectedVersion) {
      throw new HttpsError('failed-precondition', 'This expense has changed. Close the form and reopen it to review the latest values.');
    }
    const previous = Object.fromEntries(fields.map(field => [field, expense[field] ?? null]));
    const payerChanged = previous.memberId !== updated.memberId;
    const dateChanged = previous.expenseDate !== updated.expenseDate;
    const amountChanged = Math.round(Number(previous.amount) * 100) !== Math.round(updated.amount * 100);
    if (payerChanged || amountChanged || dateChanged) {
      const settlements = await transaction.get(db.collection('personalExpenseSettlements')
        .where('workspaceId', '==', access.workspaceId)
        .where('memberId', '==', previous.memberId)
        .limit(1));
      if (!settlements.empty) {
        throw new HttpsError('failed-precondition', 'This member has recorded repayments. Only the description and category can be changed.');
      }
    }
    if (dateChanged && (!/^\d{4}-\d{2}-\d{2}$/.test(updated.expenseDate)
      || !Number.isFinite(Date.parse(updated.expenseDate))
      || new Date(updated.expenseDate).toISOString().slice(0, 10) !== updated.expenseDate)) {
      throw new HttpsError('invalid-argument', 'Enter a valid expense date.');
    }
    if (payerChanged) {
      const member = (await transaction.get(db.collection('workspaceMembers').doc(updated.memberId))).data();
      if (member?.workspaceId !== access.workspaceId || member.status !== 'Active') {
        throw new HttpsError('failed-precondition', 'Choose an active member of this workspace.');
      }
    }

    const changes = { ...updated };
    // Preserve the original representation of legacy financial fields on metadata-only edits.
    if (!amountChanged) delete changes.amount;
    if (!dateChanged) delete changes.expenseDate;
    if (!payerChanged) delete changes.memberId;
    if (Object.keys(changes).every(field => previous[field] === changes[field])) return;

    transaction.update(expenseRef, { ...changes, editVersion: version });
    transaction.create(auditRef, {
      workspaceId: access.workspaceId,
      editedBy: requesterId,
      editedAt,
      previous,
      updated: { ...previous, ...changes },
      submitted: updated,
      version
    });
  });

  return { saved: true };
};
