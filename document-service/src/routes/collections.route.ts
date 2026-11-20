import express from 'express'
import { z } from 'zod'
import Collection from '../models/collection.model.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { AppError } from '../utils/AppError.js'

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
const collectionId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected a 24-character hex ID')

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
const notFound = () => new AppError(404, 'COLLECTION_NOT_FOUND', 'Collection not found')

router.use(authenticate)
router.param('id', (_req, _res, next, id: string) => {
  collectionId.parse(id)
  next()
})

router.post('/', async (req, res) => {
  noQuery.parse(req.query)
  const input = createBody.parse(req.body)
  const doc = await new Collection({ ...input, ownerId: res.locals.ownerId }).save()
  res.status(201).json({ collection: resource(doc) })
})

router.get('/', async (req, res) => {
  const { page, limit } = listQuery.parse(req.query)
  const docs = await Collection.find({ ownerId: res.locals.ownerId })
    .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit + 1)
  res.json({ collections: docs.slice(0, limit).map(resource), page, limit, hasMore: docs.length > limit })
})

router.get('/:id', async (req, res) => {
  noQuery.parse(req.query)
  const doc = await Collection.findOne({ _id: req.params.id, ownerId: res.locals.ownerId })
  if (!doc) throw notFound()
  res.json({ collection: resource(doc) })
})

router.patch('/:id', async (req, res) => {
  noQuery.parse(req.query)
  const changes = updateBody.parse(req.body)
  const doc = await Collection.findOneAndUpdate(
    { _id: req.params.id, ownerId: res.locals.ownerId },
    { $set: changes },
    { returnDocument: 'after', runValidators: true },
  )
  if (!doc) throw notFound()
  res.json({ collection: resource(doc) })
})

router.delete('/:id', async (req, res) => {
  noQuery.parse(req.query)
  const result = await Collection.deleteOne({ _id: req.params.id, ownerId: res.locals.ownerId })
  if (!result.deletedCount) throw notFound()
  res.status(204).end()
})

export default router
