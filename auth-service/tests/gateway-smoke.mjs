// Optional real gateway check: node tests/gateway-smoke.mjs (requires Docker).
// Uses a separate Compose project, no host ports, secrets, volumes or dev database.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'docmind-gateway-'))
const config = join(directory, 'compose.json')
const project = `docmind-proxy-test-${process.pid}`
const image = `${project}-auth`
writeFileSync(config, JSON.stringify({ services: {
  mongodb: { image: 'mongo:8' },
  'auth-service': {
    build: root, image,
    environment: { PORT: '3001', NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'disposable-gateway-test-secret',
      MONGO_URI: 'mongodb://mongodb:27017/docmind_gateway_test' },
    depends_on: ['mongodb'],
  },
  nginx: { image: 'nginx:alpine', depends_on: ['auth-service'],
    volumes: [`${resolve(root, '../nginx/nginx.conf')}:/etc/nginx/nginx.conf:ro`] },
  'client-a': { image, command: ['node', '-e', 'setInterval(() => {}, 1000)'] },
  'client-b': { image, command: ['node', '-e', 'setInterval(() => {}, 1000)'] },
} }))
function docker(args, capture = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Docker command failed: ${args.join(' ')}\n${result.stderr ?? ''}`)
  return result.stdout
}
const compose = (...args) => docker(['compose', '-p', project, '-f', config, ...args])
try {
  // Check the actual deployment file as well as our disposable test topology.
  const deployment = JSON.parse(docker(['compose', '-f', resolve(root, '../docker-compose.yaml'),
    'config', '--format', 'json'], true))
  assert.equal(deployment.services['auth-service'].ports?.length ?? 0, 0,
    'Auth must not publish a host port')
  compose('up', '-d', '--build')
  compose('exec', '-T', 'nginx', 'nginx', '-t')
  compose('exec', '-T', 'client-a', 'node', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch('http://nginx/health')).status === 200) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, 'Gateway must become healthy');
    for (let i = 0; i < 11; i++) {
      const response = await fetch('http://nginx/api/auth/' + (i % 2 ? 'register' : 'login'), {
        method: 'POST', headers: { 'Content-Type': 'application/json',
          'X-Forwarded-For': '203.0.113.' + (i + 1), 'X-Real-IP': '192.0.2.' + (i + 1),
          'Forwarded': 'for=203.0.113.' + (i + 1) }, body: '{}' });
      assert.equal(response.status, i < 10 ? 400 : 429);
    }
    console.log('PASS: spoofed forwarding headers cannot bypass gateway rate limiting');
  `)
  compose('exec', '-T', 'client-b', 'node', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const base = 'http://nginx/api/auth/';
    const credentials = { name: 'Gateway Test', email: 'gateway@example.com', password: 'Password123!' };
    const post = (path, body, cookie) => fetch(base + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body) });
    const cookie = response => response.headers.get('set-cookie').split(';')[0];
    const registered = await post('register', credentials);
    assert.equal(registered.status, 201, 'Separate client must have an independent counter');
    const loggedIn = await post('login', credentials);
    assert.equal(loggedIn.status, 200);
    const r1 = cookie(loggedIn);
    const access = (await loggedIn.json()).accesstoken;
    assert.equal((await fetch(base + 'me', { headers: { Authorization: 'Bearer ' + access } })).status, 200);
    const refreshed = await post('refresh', {}, r1);
    assert.equal(refreshed.status, 200);
    const r2 = cookie(refreshed);
    assert.notEqual(r1, r2);
    assert.equal((await post('logout', {}, r2)).status, 204);
    assert.equal((await post('refresh', {}, r2)).status, 401);
    console.log('PASS: distinct gateway client and authentication lifecycle');
  `)
} finally {
  try { compose('down', '--volumes', '--remove-orphans') }
  finally { rmSync(directory, { recursive: true, force: true }) }
}
