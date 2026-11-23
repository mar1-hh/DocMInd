import express from 'express'
import { Types } from 'mongoose'
import Document from '../models/document.model.js'
import { z } from 'zod'
import Collection from '../models/collection.model.js'
import { authenticate } from '../middleware/auth.middleware.js'
import documents, { objectId } from './documents.route.js'
import { activeCollection, collectionNotFound, deleteOwnedCollection } from '../storage/documents.js'

const router = express.Router()
const createBody = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
})
const updateBody = createBody.partial().refine(
  value => value.name !== undefined || value.description !== undefined,
  'Provide a name or description',
)
const positiveInteger = z.string().regex(/^[1-9]\d*$/).transform(Number)
const listQuery = z.strictObject({
  page: positiveInteger.pipe(z.int().max(10000)).default(1),
  limit: positiveInteger.pipe(z.int().max(100)).default(20),
})
const noQuery = z.strictObject({})

function resource(doc: InstanceType<typeof Collection>) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    ownerId: doc.ownerId.toString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

router.use(authenticate)
router.param('id', (_req, _res, next, id: string) => {
  objectId.parse(id)
  next()
})

router.use('/:id/documents', documents)

router.post('/', async (req, res) => {
  noQuery.parse(req.query)
  const input = createBody.parse(req.body)
  const doc = await new Collection({ ...input, ownerId: res.locals.ownerId }).save()
  res.status(201).json({ collection: resource(doc) })
})

router.get('/', async (req, res) => {
  const { page, limit } = listQuery.parse(req.query)
  const docs = await Collection.find({ ...activeCollection, ownerId: res.locals.ownerId })
    .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit + 1)
  res.json({ collections: docs.slice(0, limit).map(resource), page, limit, hasMore: docs.length > limit })
})

router.get('/dashboard', async (req, res) => {
  const { page, limit } = listQuery.parse(req.query)
  const owner = { ownerId: new Types.ObjectId(res.locals.ownerId), ...activeCollection }
  const [rows, recent, chats] = await Promise.all([
    Collection.find(owner).select('name description createdAt updatedAt ownerId latestChat.question latestChat.at')
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit + 1),
    Collection.aggregate([
      { $match: owner },
      { $lookup: { from: 'documents', localField: '_id', foreignField: 'collectionId', as: 'file', pipeline: [
        { $match: { state: 'ready' } }, { $sort: { uploadedAt: -1, _id: -1 } }, { $limit: 3 },
        { $project: { originalFilename: 1, indexStatus: 1, uploadedAt: 1 } },
      ] } },
      { $unwind: '$file' }, { $sort: { 'file.uploadedAt': -1, 'file._id': -1 } }, { $limit: 3 },
      { $project: { _id: 0, id: '$file._id', collectionId: '$_id', collectionName: '$name', filename: '$file.originalFilename',
        status: { $ifNull: ['$file.indexStatus', 'pending'] }, uploadedAt: '$file.uploadedAt' } },
    ]),
    Collection.find({ ...owner, 'latestChat.at': { $exists: true } }).sort({ 'latestChat.at': -1 }).limit(30)
      .select('name latestChat.question latestChat.at'),
  ])
  const visible = rows.slice(0, limit)
  const counts = await Document.aggregate<{ _id: Types.ObjectId; count: number; states: string[] }>([
    { $match: { collectionId: { $in: visible.map(c => c._id) }, state: 'ready' } },
    { $group: { _id: '$collectionId', count: { $sum: 1 }, states: { $addToSet: { $ifNull: ['$indexStatus', 'pending'] } } } },
  ])
  res.json({ collections: visible.map(c => {
    const group = counts.find(g => g._id.equals(c._id))
    const status = !group ? 'empty' : group.states.some(s => s === 'indexing' || s === 'pending') ? 'processing'
      : group.states.includes('failed') ? 'failed' : 'ready'
    return { ...resource(c), count: group?.count ?? 0, status, latestChat: c.latestChat }
  }), recent, chats: chats.map(c => ({ id: c.id, name: c.name, ...c.latestChat })), page, limit, hasMore: rows.length > limit })
})

router.get('/:id', async (req, res) => {
  noQuery.parse(req.query)
  const doc = await Collection.findOne({ ...activeCollection, _id: req.params.id, ownerId: res.locals.ownerId }).select('+latestChat')
  if (!doc) throw collectionNotFound()
  res.json({ collection: { ...resource(doc), latestChat: doc.latestChat } })
})

router.patch('/:id', async (req, res) => {
  noQuery.parse(req.query)
  const changes = updateBody.parse(req.body)
  const doc = await Collection.findOneAndUpdate(
    { ...activeCollection, _id: req.params.id, ownerId: res.locals.ownerId },
    { $set: changes },
    { returnDocument: 'after', runValidators: true },
  )
  if (!doc) throw collectionNotFound()
  res.json({ collection: resource(doc) })
})

router.delete('/:id', async (req, res) => {
  noQuery.parse(req.query)
  await deleteOwnedCollection(req.params.id, res.locals.ownerId)
  res.status(204).end()
})

export default router
