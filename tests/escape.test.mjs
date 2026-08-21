import { test } from 'node:test';
import assert from 'node:assert/strict';
import shared from '../shared.js';

const { escapeHtml, sanitizeImportedName } = shared;

test('escapeHtml escapes all five HTML-significant characters', () => {
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('>'), '&gt;');
  assert.equal(escapeHtml('"'), '&quot;');
  assert.equal(escapeHtml("'"), '&#39;');
});

test('escapeHtml neutralizes a script-tag XSS payload', () => {
  const payload = '<script>alert(1)</script>';
  assert.equal(escapeHtml(payload), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.ok(!escapeHtml(payload).includes('<script>'));
});

test('escapeHtml neutralizes an img-onerror XSS payload', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const out = escapeHtml(payload);
  assert.ok(!out.includes('<img'));
  assert.equal(out, '&lt;img src=x onerror=alert(1)&gt;');
});

test('escapeHtml handles a quote-breakout payload', () => {
  const payload = '" onmouseover="alert(1)';
  assert.equal(escapeHtml(payload), '&quot; onmouseover=&quot;alert(1)');
});

test('escapeHtml coerces null, undefined, and numbers safely', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(0), '0');
});

test('sanitizeImportedName strips control characters and caps length', () => {
  const NUL = String.fromCharCode(0), UNIT_SEP = String.fromCharCode(31), DEL = String.fromCharCode(127);
  const dirty = 'a' + NUL + 'b' + UNIT_SEP + 'c' + DEL + 'd  trailing  ';
  assert.equal(sanitizeImportedName(dirty), 'abcd  trailing');
  assert.equal(sanitizeImportedName('x'.repeat(200)).length, 80);
});

test('sanitizeImportedName falls back to a default for non-strings and blanks', () => {
  assert.equal(sanitizeImportedName(null), 'Untitled scenario');
  assert.equal(sanitizeImportedName(undefined), 'Untitled scenario');
  assert.equal(sanitizeImportedName(42), 'Untitled scenario');
  assert.equal(sanitizeImportedName('   '), 'Untitled scenario');
});
