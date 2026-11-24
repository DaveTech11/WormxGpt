import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.BOT_TOKEN_KEY = 'test-key-for-webhooks-0123456789abcdef';
const { cleanWebhooks, publicWebhooks, callWebhook, runTool, normalizeAgent, agentSystemPrompt } = await import('../botagent.mjs');
const { decToken } = await import('../userbots.mjs');
const { prepareSpeech, speakWav, toOggOpus } = await import('../voice.mjs');

test('webhooks: validated, secret encrypted and never exposed, kept on edit', () => {
  const a = cleanWebhooks([
    { name: 'Check_Order', description: 'Look up an order', url: 'https://8.8.8.8/hook', secret: 's3cret' },
    { name: 'weather', url: 'https://8.8.8.8/x' },            // clashes with a built-in tool
    { name: 'plain_http', url: 'http://8.8.8.8/x' },           // not https
    { name: 'creds', url: 'https://user:pw@8.8.8.8/x' },       // credentials in URL
    { name: 'check_order', url: 'https://8.8.8.8/dupe' },      // duplicate name
  ]);
  assert.equal(a.length, 1);
  assert.equal(a[0].name, 'check_order');
  assert.equal(decToken(a[0].secretEnc), 's3cret');
  assert.deepEqual(publicWebhooks(a)[0], { name: 'check_order', description: 'Look up an order', url: 'https://8.8.8.8/hook', enabled: true, hasSecret: true });
  const b = cleanWebhooks([{ name: 'check_order', url: 'https://8.8.8.8/hook', secret: '' }], a);   // edit without retyping the secret
  assert.equal(decToken(b[0].secretEnc), 's3cret');
  const c = cleanWebhooks([{ name: 'check_order', url: 'https://8.8.8.8/hook', clearSecret: true }], a);
  assert.equal(c[0].secretEnc, undefined);
  assert.equal(cleanWebhooks(Array.from({ length: 9 }, (_, i) => ({ name: 'h' + i, url: 'https://8.8.8.8/' + i }))).length, 5);
});

test('webhook call is signed, returns the endpoint answer and blocks private/redirecting targets', async () => {
  const [hook] = cleanWebhooks([{ name: 'check_order', description: 'x', url: 'https://8.8.8.8/hook', secret: 'topsecret' }]);
  const real = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, text: async () => '{"status":"shipped","eta":"2 days"}' }; };
  try {
    const out = await callWebhook(hook, { order_id: 'A1' }, { bot: { id: 'b1', name: 'Shop' }, chatId: '42' });
    assert.match(out, /shipped/);
    const body = seen.init.body, ts = seen.init.headers['X-Wormx-Timestamp'];
    assert.equal(seen.init.headers['X-Wormx-Signature'], 'sha256=' + crypto.createHmac('sha256', 'topsecret').update(`${ts}.${body}`).digest('hex'));
    assert.deepEqual(JSON.parse(body).input, { order_id: 'A1' });
    assert.equal(JSON.parse(body).chat_id, '42');
    await assert.rejects(callWebhook({ ...hook, url: 'https://127.0.0.1/hook' }, {}, {}), /public https/);
    globalThis.fetch = async () => ({ ok: false, status: 302, text: async () => '' });
    await assert.rejects(callWebhook(hook, {}, {}), /redirected/);
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    await assert.rejects(callWebhook(hook, {}, {}), /HTTP 500/);
  } finally { globalThis.fetch = real; }
});

test('agent can use a webhook as a tool and sees it in its instructions', async () => {
  const [hook] = cleanWebhooks([{ name: 'check_order', description: 'Look up an order. Send {"order_id": string}.', url: 'https://8.8.8.8/hook' }]);
  const bot = { name: 'Shop', webhooks: [hook] };
  assert.match(agentSystemPrompt(bot, normalizeAgent(null), []), /check_order/);
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => 'Order A1 is on its way' });
  try {
    assert.match(await runTool('check_order', { order_id: 'A1' }, normalizeAgent(null), { webhooks: [hook] }), /on its way/);
    await assert.rejects(runTool('check_order', {}, normalizeAgent(null), { webhooks: [{ ...hook, enabled: false }] }), /no tool called/);
  } finally { globalThis.fetch = real; }
});

test('voice: speech text is cleaned, wav is fetched and converted to ogg/opus', async () => {
  assert.equal(prepareSpeech('**Hi** 😀 see https://x.com/a `code` now.'), 'Hi see code now.');
  assert.ok(prepareSpeech('Sentence one. '.repeat(200)).length <= 900);
  // a tiny real WAV (0.3s of silence) so ffmpeg has something to convert
  const rate = 16000, n = Math.floor(rate * 0.3), data = Buffer.alloc(n * 2), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  const wav = Buffer.concat([h, data]);
  process.env.GROQ_API_KEY = 'gsk_test';
  const real = globalThis.fetch; let call;
  globalThis.fetch = async (url, init) => { call = { url: String(url), init }; return { ok: true, status: 200, arrayBuffer: async () => wav }; };
  try {
    const got = await speakWav('Hello there', { voice: 'leo' });
    assert.ok(got.equals(wav));
    assert.match(call.url, /\/audio\/speech$/);
    assert.equal(call.init.headers.Authorization, 'Bearer gsk_test');
    const sent = JSON.parse(call.init.body);
    assert.equal(sent.input, 'Hello there');
    assert.equal(sent.voice, 'leo');
    assert.equal(sent.response_format, 'wav');
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    await assert.rejects(speakWav('x'), (e) => e.status === 429);
  } finally { globalThis.fetch = real; }
  const ogg = await toOggOpus(wav);
  assert.ok(ogg && ogg.slice(0, 4).toString() === 'OggS', 'ffmpeg should produce an Ogg file');
});
