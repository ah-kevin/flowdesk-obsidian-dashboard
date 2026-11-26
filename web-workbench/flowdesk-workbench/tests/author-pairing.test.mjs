import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAuthorPairing } from '../author-pairing.mjs';

const fixtureKey = 'fixture-only-author-key';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'flowdesk-author-pairing-'));
  let pairing = await createAuthorPairing({ dataDir, key: fixtureKey });
  const server = createServer(async (incoming, response) => {
    if (incoming.url === '/pair') return pairing.handlePair(incoming, response);
    response.writeHead(pairing.hasAuthor(incoming) ? 200 : 401);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  function call(path, options = {}, body) {
    return new Promise((resolve, reject) => {
      const outgoing = request(origin + path, options, async incoming => {
        try {
          const raw = Buffer.concat(await Array.fromAsync(incoming)).toString('utf8');
          resolve({ status: incoming.statusCode, headers: incoming.headers, body: raw ? JSON.parse(raw) : null });
        } catch (error) {
          reject(error);
        }
      });
      outgoing.on('error', reject);
      outgoing.end(body);
    });
  }
  const pair = (value, headers = {}) => call('/pair', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
  }, JSON.stringify(value));
  const verify = cookie => call('/protected', { headers: cookie ? { Cookie: cookie } : {} });
  const restart = async key => { pairing = await createAuthorPairing({ dataDir, key }); };
  return { call, pair, verify, restart, dataDir };
}

test('author grants survive a restart and are invalidated when the pairing key changes', async t => {
  const { pair, verify, restart, dataDir } = await fixture(t);
  assert.equal((await verify()).status, 401);
  const created = await pair({ key: fixtureKey });
  assert.equal(created.status, 200);
  assert.deepEqual(created.body, { paired: true });
  const header = created.headers['set-cookie'][0];
  const cookie = header.split(';', 1)[0];
  assert.match(header, /^flowdesk_author=v1\./u);
  assert.match(header, /; Path=\/; HttpOnly; SameSite=Lax; Max-Age=7776000$/u);
  assert.equal((await verify(cookie)).status, 200);
  assert.equal((await verify(cookie + '; ' + cookie)).status, 401);
  const tampered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A');
  assert.equal((await verify(tampered)).status, 401);

  const statusFile = join(dataDir, 'author-pairing.json');
  const original = await readFile(statusFile, 'utf8');
  assert.equal((await stat(statusFile)).mode & 0o777, 0o600);
  assert.ok(!original.includes(fixtureKey));
  assert.ok(!original.includes(cookie));

  await restart(fixtureKey);
  assert.equal((await verify(cookie)).status, 200);
  assert.equal(await readFile(statusFile, 'utf8'), original);
  const changed = 'different-fixture-key';
  await restart(changed);
  assert.equal((await verify(cookie)).status, 401);
  assert.equal((await pair({ key: fixtureKey })).status, 401);
  const fresh = await pair({ key: changed });
  assert.equal(fresh.status, 200);
  assert.equal((await verify(fresh.headers['set-cookie'][0].split(';', 1)[0])).status, 200);
  await restart(fixtureKey);
  assert.equal((await verify(cookie)).status, 401);
});

test('pairing rejects cross-origin and inappropriate requests and adds Secure for a preserved HTTPS Host', async t => {
  const { call, pair } = await fixture(t);
  assert.equal((await call('/pair')).status, 405);
  assert.equal((await call('/pair', { method: 'POST' }, '{}')).status, 403);
  assert.equal((await pair({ key: fixtureKey }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await pair({ key: fixtureKey }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await pair({ key: fixtureKey }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await pair({ key: fixtureKey, extra: 1 })).status, 400);
  assert.equal((await pair({ key: 'x'.repeat(2100) })).status, 413);
  const secure = await pair({ key: fixtureKey }, {
    Host: 'author.example:443', Origin: 'https://author.example', 'Sec-Fetch-Site': 'same-origin',
  });
  assert.equal(secure.status, 200);
  assert.match(secure.headers['set-cookie'][0], /; Secure$/u);
});

test('failed credential attempts are rate-limited even when their requests arrive together', async t => {
  const { pair } = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 8 }, (_, index) => pair({ key: `incorrect-${index}` })));
  assert.equal(responses.filter(item => item.status === 401).length, 5);
  assert.equal(responses.filter(item => item.status === 429).length, 3);
  const blocked = await pair({ key: fixtureKey });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.equal(blocked.headers['set-cookie'], undefined);
});
