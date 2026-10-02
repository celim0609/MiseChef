import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publicStorePage = readFileSync(new URL('./PublicStorePage.tsx', import.meta.url), 'utf8');

test('editing a delivery address invalidates the complete selected destination and its quote loading state', () => {
  assert.match(publicStorePage, /const \[deliveryDestination, setDeliveryDestination\] = useState<SelectedDeliveryDestination \| null>\(null\)/);
  assert.doesNotMatch(publicStorePage, /const \[deliveryLatitude,/);
  assert.doesNotMatch(publicStorePage, /const \[deliveryLongitude,/);
  assert.match(publicStorePage, /const invalidateDeliveryQuoteRequest = \(\) => \{[\s\S]*deliveryQuoteRequestRef\.current \+= 1;[\s\S]*setIsCalculatingDelivery\(false\);[\s\S]*setIsRefreshingDeliveryQuote\(false\);/);
  assert.match(publicStorePage, /const invalidateDeliveryDestination = \(query: string\) => \{[\s\S]*invalidateDeliveryQuoteRequest\(\);[\s\S]*setDeliveryDestination\(null\);/);
  assert.match(publicStorePage, /const selectDeliveryAddress = async[\s\S]*invalidateDeliveryQuoteRequest\(\);/);
  assert.match(publicStorePage, /onChange=\{event => invalidateDeliveryDestination\(event\.target\.value\)\}/);
});

test('only an atomic selected destination is sent to the delivery quote request', () => {
  assert.match(publicStorePage, /const destination = deliveryDestination;/);
  assert.match(publicStorePage, /if \(!destination \|\|/);
  assert.match(publicStorePage, /\{ \.\.\.destination, deliveryInstructions: deliveryRemarks \}/);
  assert.match(publicStorePage, /const selectionId = \+\+deliveryDestinationSelectionRef\.current;/);
  assert.match(publicStorePage, /if \(selectionId !== deliveryDestinationSelectionRef\.current\) return;/);
});
