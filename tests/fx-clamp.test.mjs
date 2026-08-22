import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { validatedRate, CAD_TO_USD_PLAUSIBLE } = shared;

test('validatedRate accepts a normal CAD->USD rate', () => {
  assert.equal(validatedRate({ rates: { USD: 0.7278 } }), 0.7278);
});

test('validatedRate rejects NaN / non-numeric', () => {
  assert.throws(() => validatedRate({ rates: { USD: 'not-a-number' } }));
  assert.throws(() => validatedRate({ rates: {} }));
  assert.throws(() => validatedRate({}));
  assert.throws(() => validatedRate(null));
  assert.throws(() => validatedRate(undefined));
});

test('validatedRate rejects negative and zero', () => {
  assert.throws(() => validatedRate({ rates: { USD: -0.5 } }));
  assert.throws(() => validatedRate({ rates: { USD: 0 } }));
});

test('validatedRate rejects values outside the plausible band', () => {
  assert.throws(() => validatedRate({ rates: { USD: 0.10 } }));
  assert.throws(() => validatedRate({ rates: { USD: 9.9 } }));
});

test('validatedRate accepts the plausible band boundaries', () => {
  assert.equal(validatedRate({ rates: { USD: CAD_TO_USD_PLAUSIBLE.min } }), CAD_TO_USD_PLAUSIBLE.min);
  assert.equal(validatedRate({ rates: { USD: CAD_TO_USD_PLAUSIBLE.max } }), CAD_TO_USD_PLAUSIBLE.max);
});
