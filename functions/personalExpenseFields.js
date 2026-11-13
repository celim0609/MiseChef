export const validatePersonalExpenseFields = draft => {
  const amount = Math.round((typeof draft.amount === 'number' ? draft.amount : NaN) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new Error('Enter an amount greater than zero and no more than 1,000,000,000.');
  }

  const readString = value => typeof value === 'string' ? value.trim() : '';
  const memberId = readString(draft.memberId);
  const expenseDate = readString(draft.expenseDate);
  const description = readString(draft.description);
  const category = readString(draft.category);
  if (!memberId || !expenseDate || !description || !category) {
    throw new Error('Amount, date, description, category, and paid by are required.');
  }
  if (description.length > 500 || category.length > 100) {
    throw new Error('Use up to 500 characters for the description and 100 for the category.');
  }
  return { memberId, amount, expenseDate, description, category };
};
