export interface PersonalExpense {
  id: string;
  workspaceId: string;
  memberId: string;
  amount: number;
  expenseDate: string;
  description: string;
  category: string;
  merchant?: string;
  receiptUrl?: string;
  receiptPath?: string;
  receiptFileName?: string;
  createdBy: string;
  createdAt: string;
}

export interface PersonalExpenseSettlement {
  id: string;
  workspaceId: string;
  memberId: string;
  amount: number;
  settledAt: string;
  createdBy: string;
  createdAt: string;
}

export interface PersonalExpenseDraft {
  memberId: string;
  amount: number;
  expenseDate: string;
  description: string;
  category: string;
  merchant?: string;
  receiptUrl?: string;
  receiptPath?: string;
  receiptFileName?: string;
}

export interface PersonalExpenseReceiptExtraction {
  amount: number;
  expenseDate: string;
  merchant: string;
  description: string;
  category: string;
}

export interface MemberMoneyOwed {
  memberId: string;
  totalExpenses: number;
  totalSettled: number;
  outstanding: number;
  expenses: PersonalExpense[];
  settlements: PersonalExpenseSettlement[];
}
