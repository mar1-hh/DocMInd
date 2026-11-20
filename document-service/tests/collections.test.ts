import assert from 'node:assert/strict'
import { after, before, beforeEach, it } from 'node:test'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Collection from '../src/models/collection.model.js'

const secret = 'collections-integration-tests-only'
process.env.JWT_ACCESS_SECRET = secret
const id = () => new mongoose.Types.ObjectId().toString()
const alice = id()
const bob = id()
const token = (sub: string) => jwt.sign({ sub }, secret, { expiresIn: '15m', algorithm: 'HS256' })
const api = request(app)
const base = '/api/collections'
const bearer = (owner = alice) => ({ Authorization: 'Bearer ' + token(owner) })
const create = async (name: string, owner = alice) =>
  (await api.post(base).set(bearer(owner)).send({ name }).expect(201)).body.collection

let mongo: MongoMemoryServer | undefined
before(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('docmind_documents_test'))
  await Collection.init()
}, { timeout: 120_000 })
beforeEach(async () => { await Collection.deleteMany({}) })
after(async () => {
  try { await mongoose.disconnect() } finally { await mongo?.stop() }
})

it('reports health and supports the complete collection lifecycle', async () => {
  await api.get('/health').expect(200, { status: 'ok' })
  const doc = await create('  Reports  ')
  assert.match(doc.id, /^[a-f\d]{24}$/)
  assert.equal(doc.name, 'Reports')
  assert.equal(doc.ownerId, alice)
  assert.equal(doc.description, undefined)
  assert.ok(Number.isFinite(Date.parse(doc.createdAt)))
  await api.get(base + '/' + doc.id).set(bearer()).expect(200, { collection: doc })
  const updated = await api.patch(base + '/' + doc.id).set(bearer())
    .send({ name: ' Annual ', description: 'Year-end reports' }).expect(200)
  assert.deepEqual(updated.body.collection, { ...doc, name: 'Annual', description: 'Year-end reports',
    updatedAt: updated.body.collection.updatedAt })
  assert.ok(Date.parse(updated.body.collection.updatedAt) >= Date.parse(doc.updatedAt))
  await api.get(base + '/' + doc.id).set(bearer()).expect(200, updated.body)
  await api.delete(base + '/' + doc.id).set(bearer()).expect(204, '')
  await api.get(base + '/' + doc.id).set(bearer()).expect(404)
  await api.get(base).set(bearer()).expect(200, { collections: [], page: 1, limit: 20, hasMore: false })
})

it('rejects missing, invalid, expired and incompatible access tokens', async () => {
  const cases = [
    ['', 'UNAUTHORIZED'],
    ['Bearer broken', 'INVALID_TOKEN'],
    ['Bearer ' + jwt.sign({ sub: alice }, 'other-key'), 'INVALID_TOKEN'],
    ['Bearer ' + jwt.sign({ sub: alice }, secret, { algorithm: 'HS384' }), 'INVALID_TOKEN'],
    ['Bearer ' + token('invalid-id'), 'INVALID_TOKEN'],
    ['Bearer ' + jwt.sign({ sub: alice }, secret, { expiresIn: -1 }), 'TOKEN_EXPIRED'],
  ] as const
  for (const [authorization, code] of cases) {
    const res = await api.get(base).set('Authorization', authorization).expect(401)
    assert.equal(res.body.code, code)
  }
  await api.post(base).send({ name: 'Reports' }).expect(401)
  for (const verb of ['get', 'patch', 'delete'] as const) await api[verb](base + '/' + id()).expect(401)
  assert.equal(await Collection.countDocuments(), 0)
})

it('validates names, descriptions, IDs and writable fields on create and patch', async () => {
  const doc = await create('Original')
  for (const input of [{ name: ' ' }, { name: 'x'.repeat(101) }, { name: 1 }, { name: null },
    { name: 'x', description: 'x'.repeat(501) }, { name: 'x', description: null },
    { name: 'x', ownerId: bob }, { name: 'x', ownerId: alice }, { name: 'x', createdAt: '2000-01-01' },
    { name: 'x', extra: true }, {}]) {
    await api.post(base).set(bearer()).send(input).expect(400)
    await api.patch(base + '/' + doc.id).set(bearer()).send(input).expect(400)
  }
  await api.post(base).set(bearer()).send({ description: 'Missing name' }).expect(400)
  await api.post(base).set(bearer()).type('json').send('{').expect(400)
  for (const verb of ['get', 'patch', 'delete'] as const) {
    await api[verb](base + '/not-an-object-id').set(bearer()).expect(400)
  }
  assert.equal(await Collection.countDocuments(), 1)
  await api.get(base + '/' + doc.id).set(bearer()).expect(200, { collection: doc })
  await api.patch(base + '/' + doc.id).set(bearer())
    .send({ name: 'x'.repeat(100), description: 'x'.repeat(500) }).expect(200)
})

it('gives identical 404 responses for missing and unowned records', async () => {
  const doc = await create('Private')
  const expected = { code: 'COLLECTION_NOT_FOUND', message: 'Collection not found' }
  for (const target of [doc.id, id()]) {
    const path = base + '/' + target
    await api.get(path).set(bearer(bob)).expect(404, expected)
    await api.patch(path).set(bearer(bob)).send({ name: 'Changed' }).expect(404, expected)
    await api.delete(path).set(bearer(bob)).expect(404, expected)
  }
  await api.get(base + '/' + doc.id).set(bearer()).expect(200, { collection: doc })
})

it('lists only owned collections with stable newest-first pagination', async () => {
  const first = await create('First')
  const second = await create('Second')
  const third = await create('Third')
  const privateDoc = await create('Private', bob)
  // Set known creation times, including a tie, without depending on clock resolution.
  await Collection.collection.updateMany({}, { $set: { createdAt: new Date('2025-02-01') } })
  await Collection.collection.updateOne({ _id: new mongoose.Types.ObjectId(third.id) },
    { $set: { createdAt: new Date('2025-01-01') } })
  const page = async (n: number) => (await api.get(base).query({ page: n, limit: 2 }).set(bearer()).expect(200)).body
  const a = await page(1)
  assert.deepEqual(a.collections.map((x: { id: string }) => x.id), [second.id, first.id])
  assert.deepEqual([a.page, a.limit, a.hasMore], [1, 2, true])
  const b = await page(2)
  assert.deepEqual(b.collections.map((x: { id: string }) => x.id), [third.id])
  assert.equal(b.hasMore, false)
  assert.deepEqual((await page(3)).collections, [])
  const other = await api.get(base).set(bearer(bob)).expect(200)
  assert.deepEqual(other.body.collections.map((x: { id: string }) => x.id), [privateDoc.id])
})

it('rejects unknown, repeated and out-of-range query parameters', async () => {
  for (const query of ['ownerId=' + bob, 'page=0', 'page=10001', 'page=-1', 'page=abc',
    'limit=0', 'limit=101', 'limit=1.5', 'limit=', 'limit=2&limit=3']) {
    await api.get(base + '?' + query).set(bearer()).expect(400)
  }
})
