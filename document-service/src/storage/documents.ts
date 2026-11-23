import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import Collection from '../models/collection.model.js'
import Document from '../models/document.model.js'
import { AppError } from '../utils/AppError.js'

export const collectionNotFound = () => new AppError(404, 'COLLECTION_NOT_FOUND', 'Collection not found')
export const documentNotFound = () => new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found')
export const activeCollection = { deleting: { $ne: true } }
const directory = () => resolve(process.env.PDF_STORAGE_DIR ?? 'data/pdfs')
export const filePath = (storageKey: string) => resolve(directory(), storageKey)

// Compose runs one document-service. Serialize disk mutations per collection, leaving
// unrelated collections independent and keeping slow multipart transfers outside the lock.
const mutations = new Map<string, Promise<void>>()
export async function mutateCollection<T>(id: string, operation: () => Promise<T>) {
  const key = id.toLowerCase()
  const previous = mutations.get(key) ?? Promise.resolve()
  const result = previous.then(operation)
  const tail = result.then(() => {}, () => {})
  mutations.set(key, tail)
  try { return await result } finally {
    if (mutations.get(key) === tail) mutations.delete(key)
  }
}

export async function requireOwnedCollection(id: string, ownerId: string) {
  if (!await Collection.exists({ _id: id, ownerId, ...activeCollection })) throw collectionNotFound()
}

async function removeFileAndRecord(doc: InstanceType<typeof Document>) {
  await rm(filePath(doc.storageKey), { force: true })
  await Document.deleteOne({ _id: doc._id, collectionId: doc.collectionId })
}

export async function storePdf(id: string, ownerId: string, file: Express.Multer.File) {
  return mutateCollection(id, async () => {
    // The collection might have been deleted while the client was uploading.
    await requireOwnedCollection(id, ownerId)
    const doc = await Document.create({
      collectionId: id, originalFilename: file.originalname, storageKey: randomUUID(),
      size: file.size, contentType: 'application/pdf', state: 'uploading',
    })
    try {
      await writeFile(filePath(doc.storageKey), file.buffer, { flag: 'wx', mode: 0o600, flush: true })
      doc.state = 'ready'
      await doc.save()
      return doc
    } catch (error) {
      // A lost DB acknowledgement can mean the ready transition actually succeeded.
      const pending = await Document.findOne({ _id: doc._id, state: 'uploading' })
      if (pending) await removeFileAndRecord(pending)
      throw error
    }
  })
}

export async function deleteDocument(collectionId: string, documentId: string) {
  const doc = await Document.findOneAndUpdate(
    { _id: documentId, collectionId, state: { $in: ['ready', 'deleting'] } },
    { state: 'deleting' },
  )
  if (!doc) throw documentNotFound()
  await removeFileAndRecord(doc)
}

async function finishCollectionDeletion(id: string, ownerId: string) {
  for await (const doc of Document.find({ collectionId: id }).cursor()) {
    await removeFileAndRecord(doc)
  }
  await Collection.deleteOne({ _id: id, ownerId, deleting: true })
}

export async function deleteOwnedCollection(id: string, ownerId: string) {
  await mutateCollection(id, async () => {
    const marked = await Collection.updateOne({ _id: id, ownerId }, { deleting: true })
    if (!marked.matchedCount) throw collectionNotFound()
    await finishCollectionDeletion(id, ownerId)
  })
}

// Run before accepting requests so no active upload can be mistaken for an interrupted one.
export async function initializeStorage() {
  await mkdir(directory(), { recursive: true })
  for await (const doc of Document.find({ state: { $in: ['uploading', 'deleting'] } }).cursor()) {
    await removeFileAndRecord(doc)
  }
  for await (const collection of Collection.find({ deleting: true }).cursor()) {
    await finishCollectionDeletion(collection.id, collection.ownerId.toString())
  }
}
