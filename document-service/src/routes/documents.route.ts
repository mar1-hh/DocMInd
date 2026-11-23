import express from 'express'
import multer from 'multer'
import { open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import Document from '../models/document.model.js'
import { AppError } from '../utils/AppError.js'
import { deleteDocument, documentNotFound, filePath, mutateCollection, requireOwnedCollection, storePdf } from '../storage/documents.js'
import { notifyIndexer } from './indexing.js'

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Expected a 24-character hex ID')
export const maxPdfBytes = 10 * 1024 * 1024
const sizeError = () => new AppError(413, 'PDF_TOO_LARGE', 'PDFs must be 10 MiB or smaller.')
const invalidPdf = () => new AppError(400, 'INVALID_PDF', 'Choose a PDF file with content type application/pdf.')
const multipart = multer({
  storage: multer.memoryStorage(), defParamCharset: 'utf8',
  limits: { files: 1, fields: 0, fileSize: maxPdfBytes + 1 },
  fileFilter(_req, file, callback) {
    if (file.mimetype !== 'application/pdf') return callback(invalidPdf())
    callback(null, true)
  },
}).single('file')

function resource(doc: InstanceType<typeof Document>) {
  return {
    id: doc.id, collectionId: doc.collectionId, originalFilename: doc.originalFilename,
    indexStatus: doc.indexStatus ?? 'pending', indexError: doc.indexError,
    size: doc.size, contentType: doc.contentType, uploadedAt: doc.uploadedAt,
  }
}

const router = express.Router({ mergeParams: true })
router.use(async (req, res, next) => {
  z.strictObject({}).parse(req.query)
  res.locals.collectionId = objectId.parse(req.params.id)
  await requireOwnedCollection(res.locals.collectionId, res.locals.ownerId)
  next()
})
router.param('documentId', (_req, _res, next, id) => { objectId.parse(id); next() })

router.post('/', (req, res, next) => {
  multipart(req, res, error => {
    if (!error) return next()
    if (error instanceof AppError) return next(error)
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(sizeError())
    next(new AppError(400, 'INVALID_UPLOAD', 'Send one PDF in the multipart file field.'))
  })
}, async (req, res) => {
  const file = req.file
  if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Choose one PDF to upload.')
  if (file.size > maxPdfBytes) throw sizeError()
  if (!/^%PDF-\d\.\d[\r\n]/.test(file.buffer.toString('latin1', 0, 10)) ||
      !/%%EOF[\t\n\f\r ]*$/.test(file.buffer.subarray(-1024).toString('latin1'))) throw invalidPdf()
  const doc = await storePdf(res.locals.collectionId, res.locals.ownerId, file)
  notifyIndexer()
  res.status(201).json({ document: resource(doc) })
})

router.get('/', async (_req, res) => {
  const docs = await Document.find({ collectionId: res.locals.collectionId, state: 'ready' })
    .sort({ uploadedAt: -1, _id: -1 })
  res.json({ documents: docs.map(resource) })
})

router.post('/:documentId/index', async (req, res) => {
  const scope = { _id: req.params.documentId, collectionId: res.locals.collectionId, state: 'ready' } as const
  const doc = await Document.findOneAndUpdate({ ...scope, indexStatus: { $nin: ['pending', 'indexing'] } },
    { $set: { indexStatus: 'pending' }, $unset: { indexError: 1, indexPassages: 1 } }, { returnDocument: 'after' })
    ?? await Document.findOne(scope)
  if (!doc) throw documentNotFound()
  notifyIndexer()
  res.status(202).json({ document: resource(doc) })
})

router.get('/:documentId/download', async (req, res) => {
  const collectionId = res.locals.collectionId
  const { doc, handle } = await mutateCollection(collectionId, async () => {
    await requireOwnedCollection(collectionId, res.locals.ownerId)
    const doc = await Document.findOne({ _id: req.params.documentId, collectionId, state: 'ready' })
    if (!doc) throw documentNotFound()
    return { doc, handle: await open(filePath(doc.storageKey), 'r') }
  })
  try {
    res.attachment(doc.originalFilename).type('application/pdf')
      .set({ 'Content-Length': String(doc.size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
    await pipeline(handle.createReadStream(), res)
  } finally { await handle.close() }
})

router.delete('/:documentId', async (req, res) => {
  const collectionId = res.locals.collectionId
  await mutateCollection(collectionId, async () => {
    await requireOwnedCollection(collectionId, res.locals.ownerId)
    await deleteDocument(collectionId, req.params.documentId)
  })
  res.status(204).end()
})

export default router
