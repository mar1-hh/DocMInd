import assert from 'node:assert/strict'
import { after, before, beforeEach, it } from 'node:test'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import app from '../src/app.js'
import Collection from '../src/models/collection.model.js'
import Document from '../src/models/document.model.js'
import { filePath, initializeStorage } from '../src/storage/documents.js'
import { maxPdfBytes } from '../src/routes/documents.route.js'

const api = request(app)
const base = '/api/collections'
const id = () => new mongoose.Types.ObjectId().toString()
const secret = 'isolated-file-tests'
const bearer = () => ({ Authorization: 'Bearer ' + jwt.sign({ sub: id() }, secret, { expiresIn: '1h' }) })
const owner = bearer()
const other = bearer()
const collection = async () => (await api.post(base).set(owner).send({ name: 'Research' }).expect(201)).body.collection.id as string
const pdf = await readFile(new URL('./fixtures/one-page.pdf', import.meta.url))
const send = (path: string, bytes = pdf, type = 'application/pdf') => api.post(path).set(owner)
  .attach('file', bytes, { filename: 'Résumé.pdf', contentType: type })
let mongo: MongoMemoryServer
let root: string
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'docmind-pdf-test-'))
  process.env.PDF_STORAGE_DIR = root
  process.env.JWT_ACCESS_SECRET = secret
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('docmind_files_test'))
  await initializeStorage()
}, { timeout: 120_000 })
beforeEach(async () => {
  await Promise.all([Collection.deleteMany({}), Document.deleteMany({})])
  for (const key of await readdir(root)) await rm(join(root, key), { force: true, recursive: true })
})
after(async () => {
  await mongoose.disconnect()
  await mongo?.stop()
  if (root) await rm(root, { recursive: true, force: true })
})

it('isolates uploads, returns original bytes and filename, and deletes both disk and metadata', async () => {
  const a = base + '/' + await collection() + '/documents'
  const b = base + '/' + await collection() + '/documents'
  const { document } = (await send(a).expect(201)).body
  assert.equal(document.originalFilename, 'Résumé.pdf')
  assert.equal(document.contentType, 'application/pdf')
  assert.equal(document.size, pdf.length)
  assert.ok(Number.isFinite(Date.parse(document.uploadedAt)))
  assert.equal(document.storageKey, undefined)
  const stored = await Document.findById(document.id).orFail()
  assert.notEqual(stored.storageKey, document.originalFilename)
  assert.deepEqual(await readFile(filePath(stored.storageKey)), pdf)
  await api.get(a).set(owner).expect(200, { documents: [document] })
  await api.get(b).set(owner).expect(200, { documents: [] })
  const download = await api.get(a + '/' + document.id + '/download').set(owner).expect(200)
  assert.match(download.headers['content-disposition'] ?? '', /attachment;.*filename/)
  assert.equal(download.headers['content-type'], 'application/pdf')
  assert.deepEqual(download.body, pdf)
  await api.get(b + '/' + document.id + '/download').set(owner).expect(404)
  await api.delete(b + '/' + document.id).set(owner).expect(404)
  await api.delete(a + '/' + document.id).set(owner).expect(204)
  await api.get(a + '/' + document.id + '/download').set(owner).expect(404)
  assert.deepEqual(await readdir(root), [])
  assert.equal(await Document.countDocuments(), 0)
})

it('checks ownership before every file operation, including uploads', async () => {
  const path = base + '/' + await collection() + '/documents'
  const { document } = (await send(path).expect(201)).body
  for (const headers of [{}, other]) {
    const status = 'Authorization' in headers ? 404 : 401
    const operations = [() => api.get(path), () => api.post(path).attach('file', pdf, 'another.pdf'),
      () => api.get(path + '/' + document.id + '/download'), () => api.delete(path + '/' + document.id)]
    for (const operation of operations) {
      const response = await operation().set(headers).expect(status)
      assert.equal(response.body.code, status === 404 ? 'COLLECTION_NOT_FOUND' : 'UNAUTHORIZED')
    }
  }
  await api.get(path + '/bad/download').set(owner).expect(400)
  await api.get(base + '/bad/documents').set(owner).expect(400)
  assert.equal(await Document.countDocuments(), 1)
})

it('rejects invalid content, declared type, missing or extra parts, and oversized PDFs', async () => {
  const path = base + '/' + await collection() + '/documents'
  for (const bytes of [Buffer.from('not a PDF'), Buffer.from('%PDF-1.7\ntruncated')]) {
    await send(path, bytes).expect(400)
  }
  await send(path, pdf, 'text/plain').expect(400)
  await api.post(path).set(owner).send({}).expect(400)
  await api.post(path).set(owner).attach('file', pdf, 'a.pdf').attach('file', pdf, 'b.pdf').expect(400)
  await api.post(path).set(owner).field('ownerId', id()).attach('file', pdf, 'a.pdf').expect(400)
  const bytes = Buffer.alloc(maxPdfBytes, 32)
  pdf.copy(bytes)
  bytes.write('%%EOF\n', bytes.length - 6)
  await send(path, Buffer.concat([bytes, Buffer.from('\n')])).expect(413)
  assert.equal(await Document.countDocuments(), 0)
  assert.deepEqual(await readdir(root), [])
  await send(path, bytes).expect(201)
})

it('completes interrupted uploads and deletions at startup, preserving other collections', async () => {
  const a = base + '/' + await collection()
  const b = base + '/' + await collection()
  const upload = async (path: string) => {
    const response = await send(path + '/documents').expect(201)
    return Document.findById(response.body.document.id).orFail()
  }
  const interrupted = await upload(b)
  await interrupted.updateOne({ state: 'uploading' })
  const removed = await upload(b)
  await removed.updateOne({ state: 'deleting' })
  const retained = await upload(b)
  const blocked = await upload(a)
  const path = filePath(blocked.storageKey)
  await rm(path)
  await mkdir(path) // A real unlink failure leaves a durable deletion marker.
  await api.delete(a).set(owner).expect(500)
  assert.ok(await Document.exists({ _id: blocked._id }))
  await api.get(a).set(owner).expect(404)
  await rm(path, { recursive: true })
  await initializeStorage()
  await initializeStorage()
  assert.deepEqual(await readdir(root), [retained.storageKey])
  assert.equal(await Document.countDocuments(), 1)
  assert.equal(await Collection.countDocuments(), 1)
})

it('cleans up a failed write and races collection deletion safely against an upload', async () => {
  const a = base + '/' + await collection()
  const path = a + '/documents'
  const wrongDirectory = join(root, 'not-a-directory')
  await writeFile(wrongDirectory, 'test')
  process.env.PDF_STORAGE_DIR = wrongDirectory
  try {
    await send(path).expect(500)
  } finally { process.env.PDF_STORAGE_DIR = root }
  await rm(wrongDirectory)
  await initializeStorage()
  assert.equal(await Document.countDocuments(), 0)
  await send(path).expect(201)
  const [upload] = await Promise.all([send(path), api.delete(a).set(owner).expect(204)])
  assert.ok([201, 404].includes(upload.status))
  assert.equal(await Document.countDocuments(), 0)
  assert.deepEqual(await readdir(root), [])
})

it('scopes dashboard counts, recent uploads and latest questions to the owner across pages', async () => {
  const old = await collection()
  const empty = await collection()
  const uploaded = (await send(base + '/' + old + '/documents').expect(201)).body.document
  await Collection.updateOne({ _id: old }, { latestChat: { question: 'Which sample?', at: new Date() } })
  const dashboard = base + '/dashboard'
  const first = (await api.get(dashboard + '?page=1&limit=1').set(owner).expect(200)).body
  assert.equal(first.collections[0].id, empty)
  assert.equal(first.collections[0].count, 0)
  assert.equal(first.recent[0].id, uploaded.id)
  assert.equal(first.chats[0].question, 'Which sample?')
  const second = (await api.get(dashboard + '?page=2&limit=1').set(owner).expect(200)).body
  assert.equal(second.collections[0].status, 'processing')
  assert.equal(second.collections[0].count, 1)
  const privateView = (await api.get(dashboard).set(other).expect(200)).body
  for (const field of ['collections', 'recent', 'chats']) assert.deepEqual(privateView[field], [])
  await api.get(dashboard).expect(401)
})
