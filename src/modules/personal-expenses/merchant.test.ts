import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH,
  sanitizeExtractedMerchant,
  validateMerchantForSave
} from './merchant';

const contaminatedMerchant = 'TY PASAR RAYA JIMAT SDN BHDங்களுக்கும், அதேபோல சமூக ஊடக தளங்களான முகநூல், இன்ஸ்டாகிராம் மற்றும் ட்விட்டர் ஆகியவற்றில் அதிகம் பயன்படுத்தப்பட்டு வருகிறது. இந்த வகை புகைப்படங்கள், குறிப்பிட்ட ஒரு தகவலை நகைச்சுவையாகவும், அதே சமயம் சுவாரஸ்யமாகவும் தெரிவிக்கும்.<h2>மீம்கள் உருவான வரலாறு</h2>';

test('keeps valid manual merchant names', () => {
  assert.equal(validateMerchantForSave('  TY PASAR RAYA JIMAT SDN BHD  '), 'TY PASAR RAYA JIMAT SDN BHD');
});

test('discards contaminated OCR merchant output on the client', () => {
  assert.equal(sanitizeExtractedMerchant(contaminatedMerchant), '');
  assert.throws(() => validateMerchantForSave(contaminatedMerchant), /120 characters or fewer/);
});

test('manual merchant validation rejects long, multiline, and HTML values clearly', () => {
  assert.throws(
    () => validateMerchantForSave('M'.repeat(PERSONAL_EXPENSE_MERCHANT_MAX_LENGTH + 1)),
    /120 characters or fewer/
  );
  assert.throws(() => validateMerchantForSave('Merchant\nReceipt body'), /single-line business name/);
  assert.throws(() => validateMerchantForSave('Merchant <h2>body</h2>'), /without HTML or angle brackets/);
});
