import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { SENSITIVE_STORE_FIELDS, transformV2StateToV3 } = shared;

test('transformV2StateToV3 strips SENSITIVE_STORE_FIELDS by default', () => {
  const v2State = {
    currentAge: '34', tfsaBal: '25000',
    mbIsCitizen: 'yes', mbHasGreenCard: 'yes', mbGreenCardYears: '9',
    mbNetWorth: '500000', mbTaxLiability: '12000',
  };
  const v3State = transformV2StateToV3(v2State);
  for (const field of SENSITIVE_STORE_FIELDS) {
    assert.equal(field in v3State, false, `${field} should be stripped`);
  }
  // Net worth / tax liability are ordinary financial fields, not identity fields — not in
  // SENSITIVE_STORE_FIELDS, so they survive migration same as any other saved number.
  assert.equal(v3State.mbNetWorth, '500000');
  assert.equal(v3State.mbTaxLiability, '12000');
  assert.equal(v3State.currentAge, '34');
  assert.equal(v3State.tfsaBal, '25000');
});

test('transformV2StateToV3 keeps SENSITIVE_STORE_FIELDS when rememberSensitive was already true', () => {
  const v2State = {
    currentAge: '34', rememberSensitive: true,
    mbIsCitizen: 'yes', mbHasGreenCard: 'yes', mbGreenCardYears: '9',
  };
  const v3State = transformV2StateToV3(v2State);
  assert.equal(v3State.mbIsCitizen, 'yes');
  assert.equal(v3State.mbHasGreenCard, 'yes');
  assert.equal(v3State.mbGreenCardYears, '9');
});

test('transformV2StateToV3 does not mutate its input', () => {
  const v2State = { mbIsCitizen: 'yes' };
  transformV2StateToV3(v2State);
  assert.equal(v2State.mbIsCitizen, 'yes');
});
