import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH,
  sanitizeExtractedPersonalExpenseMerchant
} from './personalExpenseReceipt.js';

const contaminatedMerchant = 'TY PASAR RAYA JIMAT SDN BHDங்களுக்கும், அதேபோல சமூக ஊடக தளங்களான முகநூல், இன்ஸ்டாகிராம் மற்றும் ட்விட்டர் ஆகியவற்றில் அதிகம் பயன்படுத்தப்பட்டு வருகிறது. இந்த வகை புகைப்படங்கள், குறிப்பிட்ட ஒரு தகவலை நகைச்சுவையாகவும், அதே சமயம் சுவாரஸ்யமாகவும் தெரிவிக்கும்.<h2>மீம்கள் உருவான வரலாறு</h2>';

test('keeps a short merchant name extracted from a receipt', () => {
  assert.equal(
    sanitizeExtractedPersonalExpenseMerchant('  TY PASAR RAYA JIMAT SDN BHD  '),
    'TY PASAR RAYA JIMAT SDN BHD'
  );
});

test('discards the exact merchant contamination pattern instead of summarizing it', () => {
  assert.equal(sanitizeExtractedPersonalExpenseMerchant(contaminatedMerchant), '');
});

test('discards multiline, HTML, prose-like, and abnormally long OCR merchant output', () => {
  assert.equal(sanitizeExtractedPersonalExpenseMerchant('Merchant Name\nReceipt item'), '');
  assert.equal(sanitizeExtractedPersonalExpenseMerchant('<h2>Merchant Name</h2>'), '');
  assert.equal(sanitizeExtractedPersonalExpenseMerchant('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen'), '');
  assert.equal(sanitizeExtractedPersonalExpenseMerchant('M'.repeat(PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH + 1)), '');
});
