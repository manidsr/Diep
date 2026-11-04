import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage, sanitizeName } from '../src/shared/protocol';

test('rejects malformed, oversized and unknown messages', () => {
  for (const bad of ['', 'nope', '[]', 'null', '{"t":"x"}', '{"t":"input","mx":"1","my":0,"a":0}', '{"t":"input","mx":1,"my":0}',
    '{"t":"upgrade","stat":8}', '{"t":"upgrade","stat":-1}', '{"t":"upgrade","stat":1.5}', '{"t":"class","id":"A B"}',
    '{"t":"join","name":"' + 'x'.repeat(400) + '"}']) {
    assert.equal(parseClientMessage(bad), null, bad);
  }
  assert.equal(parseClientMessage('{"t":"input","mx":1e999,"my":0,"a":0}'), null);
});

test('clamps movement and normalizes primary, secondary and spin flags', () => {
  const message = parseClientMessage('{"t":"input","mx":50,"my":-50,"a":3,"f":1}');
  assert.deepEqual(message, { t: 'input', mx: 1, my: -1, a: 3, f: true, secondary: false, spin: false });
  assert.deepEqual(
    parseClientMessage('{"t":"input","mx":0,"my":0,"a":1,"f":0,"secondary":1,"spin":true}'),
    { t: 'input', mx: 0, my: 0, a: 1, f: false, secondary: true, spin: true },
  );
});

test('accepts valid upgrade/class and sanitizes names', () => {
  assert.deepEqual(parseClientMessage('{"t":"upgrade","stat":7}'), { t: 'upgrade', stat: 7 });
  assert.deepEqual(parseClientMessage('{"t":"class","id":"twin"}'), { t: 'class', id: 'twin' });
  assert.deepEqual(parseClientMessage('{"t":"devClass","id":"octo"}'), { t: 'devClass', id: 'octo' });
  assert.equal(parseClientMessage('{"t":"devClass","id":"OCTO"}'), null);
  assert.equal(sanitizeName('  <b>Bob</b>\n\t  Smith  and more words '), 'bBob/b Smith and');
  assert.equal(sanitizeName('<script>'), 'script');
  assert.equal(sanitizeName(''), 'Tank');
  assert.equal(sanitizeName(42), 'Tank');
  assert.ok(sanitizeName('x'.repeat(100)).length <= 16);
});


test('join protocol supports FFA and Team Mode selection', () => {
  assert.deepEqual(parseClientMessage('{"t":"join","name":"Solo","mode":"ffa"}'), {
    t: 'join', name: 'Solo', mode: 'ffa',
  });
  assert.deepEqual(parseClientMessage('{"t":"join","name":"Team","mode":"teams"}'), {
    t: 'join', name: 'Team', mode: 'teams',
  });
});
