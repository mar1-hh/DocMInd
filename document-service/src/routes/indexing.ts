import { Router } from 'express'
import Document from '../models/document.model.js'
import { filePath, documentNotFound } from '../storage/documents.js'

// The pending record is durable. The worker also polls for missed notifications and legacy PDFs.
export function notifyIndexer() {
  const base = process.env.CHATBOT_SERVICE_URL
  if (!base) return
  void fetch(base + '/internal/index', { method: 'POST', signal: AbortSignal.timeout(2500) })
    .then(async res => {
      if (!res.ok) console.warn('Index notification deferred to worker poll')
      await res.body?.cancel()
    })
    .catch(() => console.warn('Index notification deferred to worker poll'))
}

export const indexFiles = Router()
indexFiles.get('/:id', async (req, res) => {
  const attempt = req.get('X-Index-Attempt')
  if (!attempt || !/^[a-f\d]{24}$/i.test(req.params.id)) throw documentNotFound()
  const doc = await Document.findOne({ _id: req.params.id, state: 'ready', indexStatus: 'indexing', indexAttempt: attempt })
  if (!doc) throw documentNotFound()
  res.type('application/pdf').set('Cache-Control', 'no-store').sendFile(filePath(doc.storageKey))
})
