// Free subdomains for hosted projects: yourname.is-a.dev and yourname.js.org
//
// These two services are NOT sold. They give out names for free, and the volunteers who run them approve each
// name by reviewing a GitHub pull request. So Wormx GPT cannot "buy" one for the user and cannot approve one. What Wormx GPT does:
//   1. checks the name, keeps a limit of FREE_DOMAINS_PER_USER (default 2) free names per person,
//   2. writes the exact file / line the pull request needs, pointing at the person's own Render project,
//   3. opens the right GitHub page with the file already filled in (is-a.dev),
//   4. checks the DNS by itself, and when the name really points at the project it marks it active so the person
//      can connect it with the normal "connect a domain" button.
// Nothing is ever sent to GitHub on the user's behalf, and no email address is put in a public file for them.
//
// The file formats belong to those projects and may change. Each card links to the project's own README.
//
// Env (optional): FREE_DOMAINS_PER_USER (2), FREE_DOMAINS_LIFETIME (6 requests ever, stops name-farming)
import dns from 'node:dns/promises';

const num = (k, d) => { const n = parseInt(process.env[k] || '', 10); return Number.isFinite(n) && n > 0 ? n : d; };
export const FREE_LIMIT = () => num('FREE_DOMAINS_PER_USER', 2);
export const LIFETIME_LIMIT = () => num('FREE_DOMAINS_LIFETIME', 6);

export const PROVIDERS = {
  'is-a.dev': {
    label: 'is-a.dev',
    repo: 'https://github.com/is-a-dev/register',
    needs: 'a GitHub account; the site must be a real developer project',
  },
  'js.org': {
    label: 'js.org',
    repo: 'https://github.com/js-org/js.org',
    needs: 'a GitHub account; the project must be about JavaScript and already online',
  },
};

// Names people could use to look official or break things. Kept small on purpose: the real review is done by the volunteers.
const RESERVED = new Set([
  'www', 'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ns', 'ns1', 'ns2', 'dns', 'admin', 'root', 'api', 'app', 'dev',
  'test', 'staging', 'status', 'support', 'help', 'billing', 'pay', 'payment', 'payments', 'login', 'auth', 'account',
  'security', 'abuse', 'postmaster', 'hostmaster', 'webmaster', 'xyron', 'xryon', 'xyron-ai', 'google', 'github',
  'microsoft', 'apple', 'amazon', 'paypal', 'flutterwave', 'opay', 'binance', 'anthropic', 'openai', 'chatgpt', 'claude',
]);

export function cleanSub(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/.test(s)) return '';
  if (s.includes('--')) return '';
  if (RESERVED.has(s)) return '';
  return s;
}

export const cleanGithub = (raw) => {
  const s = String(raw || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(s) && !s.includes('--') ? s : '';
};

const cleanHost = (raw) => {
  const s = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(s) ? s : '';
};

// Only real pull-request links of the right project are kept.
export function cleanPrUrl(provider, raw) {
  const repo = PROVIDERS[provider]?.repo;
  const s = String(raw || '').trim();
  if (!repo || !s.startsWith(repo + '/pull/')) return '';
  return /^[0-9]{1,8}(?:[/?#].*)?$/.test(s.slice((repo + '/pull/').length)) ? s.split(/[?#]/)[0] : '';
}

// What the person has to put in the pull request.
export function instructions(rec, github = '') {
  const p = PROVIDERS[rec.provider];
  if (rec.provider === 'is-a.dev') {
    const file = `domains/${rec.sub}.json`;
    const json = JSON.stringify({
      owner: { username: github || 'YOUR_GITHUB_USERNAME', email: 'YOUR_EMAIL' },
      records: { CNAME: rec.target },
    }, null, 2) + '\n';
    return {
      repo: p.repo,
      file,
      content: json,
      openUrl: `${p.repo}/new/main?filename=${encodeURIComponent(file)}&value=${encodeURIComponent(json)}`,
      steps: [
        'Open the link. GitHub asks you to fork the project and start a pull request; accept.',
        'Replace YOUR_EMAIL with your real email. It becomes public in that project, so use one you are happy to show.',
        'Create the pull request and wait. A volunteer reviews it; this can take days.',
        'Come back and press “Check”. When the name points at your project it turns active.',
      ],
    };
  }
  const line = `"${rec.sub}": "${rec.target}", // Wormx GPT project`;
  return {
    repo: p.repo,
    file: 'cnames_active.js',
    content: line + '\n',
    openUrl: p.repo,
    steps: [
      'Open the project and read its README first: the rules are strict (JavaScript project, site already online).',
      'Fork it and add the line above to cnames_active.js, in alphabetical order, then open a pull request.',
      'Wait for a volunteer to review it; this can take days.',
      'Come back and press “Check”. When the name points at your project it turns active.',
    ],
  };
}

const view = (rec) => ({
  id: rec.id, provider: rec.provider, sub: rec.sub, fqdn: rec.fqdn, target: rec.target, serviceId: rec.serviceId,
  status: rec.status, prUrl: rec.prUrl || '', createdAt: rec.createdAt, submittedAt: rec.submittedAt || '', activeAt: rec.activeAt || '',
  github: rec.github || '',
  ...(rec.status === 'draft' || rec.status === 'submitted' ? { guide: instructions(rec, rec.github) } : {}),
});

const counts = (db, userId) => {
  const mine = db.freeDomains.filter((x) => x.userId === userId);
  return { used: mine.filter((x) => x.status !== 'cancelled').length, ever: mine.length, mine };
};

// DNS check. `resolver` is injectable for tests.
export async function pointsAt(fqdn, target, resolver = dns) {
  try {
    const list = await resolver.resolveCname(fqdn);
    return list.some((x) => String(x).toLowerCase().replace(/\.$/, '') === target);
  } catch { return false; }
}

// c = { p, method, data, me, db, save, send, res, id, now, admin, hostFor, resolver }  ->  true when handled
export async function handleFreeDomains(c) {
  const { p, method, data, me, db, save, send, res, id, now, hostFor } = c;
  if (!p.startsWith('/api/free-domains')) return false;
  if (!me) { await send(res, 401, { message: 'Sign in first.' }); return true; }
  if (!Array.isArray(db.freeDomains)) db.freeDomains = [];

  if (p === '/api/free-domains' && method === 'GET') {
    const n = counts(db, me.id);
    await send(res, 200, {
      limit: FREE_LIMIT(), used: n.used,
      providers: Object.entries(PROVIDERS).map(([k, v]) => ({ id: k, label: v.label, repo: v.repo, needs: v.needs })),
      items: n.mine.filter((x) => x.status !== 'cancelled').map(view),
    });
    return true;
  }

  if (p === '/api/free-domains/request' && method === 'POST') {
    const provider = String(data.provider || '');
    if (!PROVIDERS[provider]) { await send(res, 400, { message: 'Pick is-a.dev or js.org.' }); return true; }
    const sub = cleanSub(data.name);
    if (!sub) { await send(res, 400, { message: 'Use 3 to 32 letters, numbers or single hyphens (not at the start or end). Names like www, mail or admin are not allowed.' }); return true; }
    const github = cleanGithub(data.github);
    if (provider === 'is-a.dev' && !github) { await send(res, 400, { message: 'Enter your GitHub username (is-a.dev needs it in the request file).' }); return true; }
    const sid = String(data.serviceId || '');
    if (!/^srv-[a-z0-9]+$/.test(sid)) { await send(res, 400, { message: 'Pick the project this name should open.' }); return true; }
    const n = counts(db, me.id);
    if (n.used >= FREE_LIMIT()) { await send(res, 429, { message: `You already have ${FREE_LIMIT()} free domain${FREE_LIMIT() > 1 ? 's' : ''}. Cancel one to free a spot, or buy a domain instead.` }); return true; }
    if (n.ever >= LIFETIME_LIMIT()) { await send(res, 429, { message: 'You reached the limit of free domain requests. Buy a domain instead.' }); return true; }
    const fqdn = `${sub}.${provider}`;
    if (db.freeDomains.some((x) => x.fqdn === fqdn && x.status !== 'cancelled')) { await send(res, 409, { message: 'Someone already asked for that name here. Try another.' }); return true; }
    let target = '';
    try { target = cleanHost(await hostFor(me, sid)); }
    catch (e) { await send(res, e.status || 502, { message: e.message || 'Could not read that project.' }); return true; }
    if (!target) { await send(res, 400, { message: 'That project has no public address yet. Deploy it first.' }); return true; }
    const rec = { id: id(), userId: me.id, provider, sub, fqdn, serviceId: sid, target, github, status: 'draft', createdAt: now() };
    db.freeDomains.unshift(rec);
    await save();
    await send(res, 200, { ok: true, item: view(rec), used: n.used + 1, limit: FREE_LIMIT() });
    return true;
  }

  const find = () => db.freeDomains.find((x) => x.id === String(data.id || '') && x.userId === me.id && x.status !== 'cancelled');

  if (p === '/api/free-domains/submitted' && method === 'POST') {
    const rec = find();
    if (!rec) { await send(res, 404, { message: 'Request not found.' }); return true; }
    if (rec.status === 'active') { await send(res, 200, { ok: true, item: view(rec) }); return true; }
    const pr = cleanPrUrl(rec.provider, data.prUrl);
    if (data.prUrl && !pr) { await send(res, 400, { message: `Paste the pull request link, like ${PROVIDERS[rec.provider].repo}/pull/123` }); return true; }
    rec.status = 'submitted'; rec.prUrl = pr; rec.submittedAt = now();
    await save();
    await send(res, 200, { ok: true, item: view(rec) });
    return true;
  }

  if (p === '/api/free-domains/check' && method === 'POST') {
    const rec = find();
    if (!rec) { await send(res, 404, { message: 'Request not found.' }); return true; }
    const live = await pointsAt(rec.fqdn, rec.target, c.resolver);
    if (live && rec.status !== 'active') { rec.status = 'active'; rec.activeAt = now(); await save(); }
    await send(res, 200, { ok: true, live, item: view(rec) });
    return true;
  }

  if (p === '/api/free-domains/cancel' && method === 'POST') {
    const rec = find();
    if (!rec) { await send(res, 404, { message: 'Request not found.' }); return true; }
    rec.status = 'cancelled'; rec.cancelledAt = now();
    await save();
    await send(res, 200, { ok: true });
    return true;
  }

  await send(res, 404, { message: 'Not found' });
  return true;
}
