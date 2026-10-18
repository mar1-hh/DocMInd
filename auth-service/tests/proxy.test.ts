import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { beforeEach, describe, it } from 'node:test'
import request from 'supertest'
import app from '../src/app.js'
import { authLimiter } from '../src/middleware/rateLimit.middleware.js'

// Supertest connects as NGINX would. These are gateway-supplied client addresses,
// not headers a public client is allowed to pass through the gateway unchanged.
const firstClient = '198.51.100.10'
const secondClient = '198.51.100.11'

beforeEach(async () => {
  await Promise.all([firstClient, secondClient].map(ip => authLimiter.resetKey(ip)))
})

describe('single NGINX proxy and authentication rate limiting', () => {
  it('trusts exactly the immediate proxy hop', () => {
    assert.equal(app.get('trust proxy'), 1)
    const trust = app.get('trust proxy fn') as (ip: string, hop: number) => boolean
    assert.equal(trust('172.18.0.2', 0), true)
    assert.equal(trust(firstClient, 1), false)
  })

  it('limits one client across login and registration while another has its own counter', async () => {
    for (let index = 0; index < 10; index++) {
      // Invalid input stops before any database access; it must still be limited.
      await request(app).post(`/api/auth/${index % 2 ? 'register' : 'login'}`)
        .set('X-Forwarded-For', firstClient).send({}).expect(400)
    }
    const blocked = await request(app).post('/api/auth/login')
      .set('X-Forwarded-For', firstClient).send({}).expect(429)
    assert.equal(blocked.body.code, 'TOO_MANY_REQUESTS')
    assert.ok(blocked.headers['retry-after'])
    await request(app).post('/api/auth/register')
      .set('X-Forwarded-For', secondClient).send({}).expect(400)
    await request(app).get('/health').set('X-Forwarded-For', firstClient).expect(200)
  })

  it('cannot evade the limit using spoofed addresses before the gateway client address', async () => {
    for (let index = 0; index < 11; index++) {
      await request(app).post('/api/auth/login')
        .set('X-Forwarded-For', `203.0.113.${index + 1}, ${firstClient}`)
        .set('X-Real-IP', `203.0.113.${index + 1}`)
        .send({}).expect(index < 10 ? 400 : 429)
    }
  })

  it('requires the gateway to overwrite untrusted forwarding headers for both existing routes', async () => {
    const config = await readFile(new URL('../../nginx/nginx.conf', import.meta.url), 'utf8')
    assert.match(config, /proxy_set_header X-Forwarded-For \$remote_addr;/)
    assert.match(config, /proxy_set_header X-Real-IP \$remote_addr;/)
    assert.match(config, /proxy_set_header Forwarded "";/)
    assert.doesNotMatch(config, /\$proxy_add_x_forwarded_for|\$http_x_forwarded_for/)
    for (const route of ['/api/auth/', '/health']) {
      assert.ok(config.includes(`location ${route} {`))
    }
    // Location-level overrides would stop inheritance of the server headers.
    const locations = config.match(/location\s+[^{}]+\{[^{}]*\}/g) ?? []
    assert.equal(locations.length, 2)
    for (const location of locations) {
      assert.match(location, /proxy_pass http:\/\/auth-service:3001;/)
      assert.doesNotMatch(location, /proxy_set_header/)
    }
  })
})
