import test from 'node:test';
import assert from 'node:assert/strict';
import { encToken, decToken, tokenLooksValid, splitMessage, publicBot, burstOk, remember, getHistory, clearHistory, safeEqual, botLimit } from '../userbots.mjs';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0';

test('token encryption round-trips and hides the token', () => {
  const packed = encToken(TOKEN);
  assert.ok(!packed.includes(TOKEN));
  assert.equal(decToken(packed), TOKEN);
  assert.equal(decToken('garbage'), '');
});

test('token format check', () => {
  assert.ok(tokenLooksValid(TOKEN));
  assert.ok(!tokenLooksValid('hello'));
  assert.ok(!tokenLooksValid(''));
});

test('long replies split under the Telegram limit', () => {
  const parts = splitMessage(('word '.repeat(200) + '\n\n').repeat(10), 3900);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 3900));
});

test('publicBot never exposes secrets', () => {
  const j = JSON.stringify(publicBot({ id: 'a', name: 'B', username: 'b_bot', tokenEnc: 'x', secret: 'y', persona: 'p' }));
  assert.ok(!j.includes('tokenEnc') && !j.includes('secret'));
});

test('history keeps the last 12 and can be cleared', () => {
  for (let i = 0; i < 20; i++) remember('b1', 'c1', 'user', 'm' + i);
  assert.equal(getHistory('b1', 'c1').length, 12);
  clearHistory('b1', 'c1');
  assert.equal(getHistory('b1', 'c1').length, 0);
});

test('burst limit is 20 per minute', () => {
  let ok = 0;
  for (let i = 0; i < 25; i++) if (burstOk('burst-bot')) ok++;
  assert.equal(ok, 20);
});

test('safeEqual and limits', () => {
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(botLimit(true) > botLimit(false));
});
