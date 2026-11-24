import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStep, calc, clock, runTool, runBotAgent, normalizeAgent, agentSystemPrompt } from '../botagent.mjs';

const bot = { name: 'Helper', persona: 'Be brief.' };
const mkCtx = () => ({ notes: [], saveNotes: async () => {}, reminders: [], addReminder: async function (m, t) { this.reminders.push([m, t]); } });

test('parseStep: plain text, final, tool and tools', () => {
  assert.deepEqual(parseStep('Hello there'), { final: 'Hello there' });
  assert.deepEqual(parseStep('{"final":"done"}'), { final: 'done' });
  assert.deepEqual(parseStep('```json\n{"tool":"time","args":{}}\n```'), { tools: [{ tool: 'time', args: {} }] });
  assert.equal(parseStep('{"tools":[{"tool":"a"},{"tool":"b"},{"tool":"c"}]}').tools.length, 2);
  assert.deepEqual(parseStep('Use {braces} freely'), { final: 'Use {braces} freely' });
});

test('calculator is exact and refuses code', () => {
  assert.equal(calc('(1200*0.15)+40'), '220');
  assert.equal(calc('2^10'), '1024');
  assert.throws(() => calc('process.exit()'));
  assert.throws(() => calc('1/0'));
});

test('clock handles bad zones', () => {
  assert.match(clock('Africa/Lagos'), /\d{4}/);
  assert.throws(() => clock('Not/AZone'));
});

test('switched-off tools are refused', async () => {
  const agent = normalizeAgent({ enabled: true, tools: { calculator: false } });
  await assert.rejects(runTool('calculator', { expression: '1+1' }, agent, mkCtx()), /switched off/);
  await assert.rejects(runTool('nope', {}, agent, mkCtx()), /no tool/);
});

test('reminders and notes', async () => {
  const agent = normalizeAgent();
  const ctx = mkCtx();
  await runTool('remind', { minutes: 5, text: 'stretch' }, agent, ctx);
  assert.deepEqual(ctx.reminders, [[5, 'stretch']]);
  await assert.rejects(runTool('remind', { minutes: 0, text: 'x' }, agent, ctx));
  await runTool('notes_save', { note: 'Likes tea' }, agent, ctx);
  assert.equal(await runTool('notes_save', { note: 'likes tea' }, agent, ctx), 'Already saved.');
  assert.equal(ctx.notes.length, 1);
  await runTool('notes_forget', { index: 1 }, agent, ctx);
  assert.equal(ctx.notes.length, 0);
});

test('agent loop: tool call then final answer, repeat guard, step cap', async () => {
  const replies = ['{"tool":"calculator","args":{"expression":"6*7"}}', 'It is 42.'];
  let seenResult = '';
  const askAI = async (msgs) => { const last = msgs[msgs.length - 1].content; if (last.includes('tool_result')) seenResult = last; return replies.shift(); };
  const r = await runBotAgent({ bot, history: [{ role: 'user', content: '6x7?' }], askAI, ctx: mkCtx() });
  assert.equal(r.text, 'It is 42.');
  assert.deepEqual(r.steps, ['calculator']);
  assert.match(seenResult, /<tool_result name="calculator">\n42\n/);

  let calls = 0;
  const looper = async () => (++calls <= 20 ? '{"tool":"time","args":{}}' : 'ok');
  const r2 = await runBotAgent({ bot, history: [{ role: 'user', content: 'x' }], askAI: looper, ctx: mkCtx() });
  assert.ok(calls <= 6);
  assert.ok(typeof r2.text === 'string' && r2.text.length);
});

test('prompt lists only enabled tools and includes notes', () => {
  const agent = normalizeAgent({ enabled: true, tools: { web_search: false, read_page: false, remind: false } });
  const p = agentSystemPrompt(bot, agent, [{ t: 'Name is Ada' }]);
  assert.ok(!p.includes('web_search {') && p.includes('calculator {') && p.includes('Name is Ada'));
});

import { cleanCommands, matchCommand, recordStat, statsSummary, weather, currency, githubRepo, TOOL_KEYS } from '../botagent.mjs';

test('custom commands: cleaned, reserved names blocked, {{input}} filled', () => {
  const list = cleanCommands([
    { name: '/Summarize', description: 'Short summary', prompt: 'Summarize: {{input}}' },
    { name: 'start', prompt: 'x' }, { name: 'bad name', prompt: 'x' }, { name: 'summarize', prompt: 'dup' }, { name: 'tip', prompt: 'Give a tip' },
  ]);
  assert.deepEqual(list.map((c) => c.name), ['summarize', 'tip']);
  assert.equal(matchCommand(list, '/summarize hello world').text, 'Summarize: hello world');
  assert.equal(matchCommand(list, '/tip@MyBot cats').text, 'Give a tip\n\nInput: cats');
  assert.equal(matchCommand(list, '/nope'), null);
  assert.equal(matchCommand(list, 'plain text'), null);
});

test('analytics counts replies, errors, tools and people', () => {
  const bot = {};
  recordStat(bot, { ok: true, ms: 1000, tools: ['weather', 'time'], chatId: '111' });
  recordStat(bot, { ok: true, ms: 3000, tools: ['weather'], chatId: '222' });
  recordStat(bot, { ok: false, chatId: '111' });
  const s = statsSummary(bot);
  assert.equal(s.messages30d, 3); assert.equal(s.errors30d, 1); assert.equal(s.users, 2);
  assert.equal(s.tools[0].name, 'weather'); assert.equal(s.tools[0].n, 2);
  assert.equal(s.series.length, 14); assert.equal(s.series[13].m, 3);
});

test('new tools validate input and parse live data (mocked network)', async () => {
  assert.ok(['weather', 'currency', 'github'].every((k) => TOOL_KEYS.includes(k)));
  await assert.rejects(currency(5, 'usd', 'naira'), /3-letter/);
  await assert.rejects(githubRepo('not a repo'), /owner\/name/);
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const url = String(u);
    const ok = (o) => ({ ok: true, status: 200, json: async () => o });
    if (url.includes('geocoding')) return ok({ results: [{ name: 'Lagos', country: 'Nigeria', latitude: 6.5, longitude: 3.4 }] });
    if (url.includes('open-meteo.com/v1/forecast')) return ok({ current: { temperature_2m: 30.2, apparent_temperature: 34, relative_humidity_2m: 80, wind_speed_10m: 12, weather_code: 2 }, daily: { time: ['2026-11-08'], weather_code: [61], temperature_2m_max: [31], temperature_2m_min: [24], precipitation_probability_max: [60] } });
    if (url.includes('er-api')) return ok({ rates: { NGN: 1500 }, time_last_update_utc: 'Sun, 08 Nov 2026 00:00:01 +0000' });
    if (url.includes('/releases/latest')) return ok({ tag_name: 'v1.2.3', published_at: '2026-10-01T00:00:00Z' });
    if (url.includes('api.github.com/repos/')) return ok({ full_name: 'a/b', description: 'demo', stargazers_count: 7, forks_count: 1, open_issues_count: 2, language: 'JS', license: { spdx_id: 'MIT' }, pushed_at: '2026-11-01T00:00:00Z', topics: ['bot'], html_url: 'https://github.com/a/b' });
    throw new Error('unexpected ' + url);
  };
  try {
    assert.match(await weather('Lagos'), /Lagos, Nigeria - now 30°C.*light rain/s);
    assert.match(await currency(2, 'usd', 'ngn'), /2 USD = 3,000 NGN/);
    assert.match(await githubRepo('https://github.com/a/b'), /Stars 7.*licence MIT.*v1\.2\.3/s);
  } finally { globalThis.fetch = real; }
});

test('agent loop returns a tool trace', async () => {
  const agent = normalizeAgent(null);
  let n = 0;
  const askAI = async () => (n++ === 0 ? '{"tool":"calculator","args":{"expression":"6*7"}}' : 'It is 42.');
  const r = await runBotAgent({ bot, history: [{ role: 'user', content: 'what is 6*7' }], askAI, ctx: mkCtx(), agent });
  assert.equal(r.text, 'It is 42.');
  assert.equal(r.trace.length, 1); assert.equal(r.trace[0].tool, 'calculator'); assert.equal(r.trace[0].ok, true); assert.match(r.trace[0].result, /42/);
});
