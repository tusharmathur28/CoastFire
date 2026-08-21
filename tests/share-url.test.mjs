import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { SENSITIVE_SHARE_FIELDS, buildSharePayload, parseShareParamsString } = shared;

test('buildSharePayload drops every SENSITIVE_SHARE_FIELDS key', () => {
  const allInputs = {
    currentAge: '34', retireAge: '60', tfsaBal: '25000',
    mbIsCitizen: 'yes', mbHasGreenCard: 'yes', mbGreenCardYears: '9',
    mbNetWorth: '500000', mbTaxLiability: '12000',
  };
  const payload = buildSharePayload(allInputs);
  for (const field of SENSITIVE_SHARE_FIELDS) {
    assert.equal(field in payload, false, `${field} should be dropped`);
  }
});

test('buildSharePayload keeps every non-sensitive field intact', () => {
  const allInputs = { currentAge: '34', retireAge: '60', tfsaBal: '25000', mbIsCitizen: 'yes' };
  const payload = buildSharePayload(allInputs);
  assert.equal(payload.currentAge, '34');
  assert.equal(payload.retireAge, '60');
  assert.equal(payload.tfsaBal, '25000');
  assert.equal('mbIsCitizen' in payload, false);
});

test('fragment round-trip preserves floats, booleans-as-strings, and a nested life-events array', () => {
  const original = {
    returnRate: '7.25', inflationRate: '2.5', stopAtCoast: 'yes',
    lifeEvents: JSON.stringify([{ age: 45, amount: -50000, account: 'tfsa', label: 'House down payment' }]),
  };
  const encoded = new URLSearchParams(original).toString();
  const decoded = parseShareParamsString(encoded);
  assert.deepEqual(decoded, original);
  assert.deepEqual(JSON.parse(decoded.lifeEvents), JSON.parse(original.lifeEvents));
});

test('parseShareParamsString handles a legacy query-string payload the same way', () => {
  const legacyQueryString = 'currentAge=28&retireAge=65&mbNetWorth=200000';
  const decoded = parseShareParamsString(legacyQueryString);
  assert.equal(decoded.currentAge, '28');
  assert.equal(decoded.retireAge, '65');
  // Legacy links predate the sensitive-field exclusion, so a stale one could still carry mbNetWorth —
  // parsing doesn't filter it (that only happens in buildSharePayload on the way out); the inbound
  // consent gate in initSharedParamsConsentFlow() is what protects the recipient from an old link.
  assert.equal(decoded.mbNetWorth, '200000');
});
