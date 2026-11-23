import { z } from 'zod'
import { authStore } from '../auth/authStore'
import { ApiError, parseResponse } from './auth'

const documentSchema = z.object({
  id: z.string(), collectionId: z.string(), originalFilename: z.string(), uploadedAt: z.iso.datetime(),
  indexStatus: z.enum(['pending', 'indexing', 'ready', 'failed']), indexError: z.string().optional(),
  contentType: z.literal('application/pdf'), size: z.int().nonnegative(),
})
export type CollectionDocument = z.infer<typeof documentSchema>

function path(collectionId: string) {
  return '/' + encodeURIComponent(collectionId) + '/documents'
}
const call = (url: string, init: RequestInit) => authStore.authenticatedRequest(url, init, 'collections')

export async function listDocuments(collectionId: string, signal: AbortSignal) {
  return parseResponse(z.object({ documents: z.array(documentSchema) }),
    await call(path(collectionId), { signal })).documents
}
export async function uploadPdf(collectionId: string, file: File) {
  const body = new FormData()
  body.set('file', file)
  try {
    return parseResponse(z.object({ document: documentSchema }),
      await call(path(collectionId), { method: 'POST', body, signal: AbortSignal.timeout(120_000) }))
  } catch (error) {
    // Nginx can reject the whole request before the service returns a JSON error.
    if (error instanceof ApiError && error.status === 413) throw new ApiError('PDFs must be 10 MiB or smaller.', 413)
    throw error
  }
}
export async function fetchPdf(collectionId: string, documentId: string, signal?: AbortSignal) {
  const file = await call(path(collectionId) + '/' + encodeURIComponent(documentId) + '/download', { signal: signal ?? AbortSignal.timeout(120_000) })
  return parseResponse(z.instanceof(Blob), file)
}
export async function downloadPdf(collectionId: string, doc: CollectionDocument) {
  const blob = await fetchPdf(collectionId, doc.id)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = doc.originalFilename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function deleteDocument(collectionId: string, id: string) {
  return call(path(collectionId) + '/' + encodeURIComponent(id), { method: 'DELETE' })
}

export function indexDocument(collectionId: string, id: string) {
  return call(path(collectionId) + '/' + encodeURIComponent(id) + '/index', { method: 'POST' })
}
