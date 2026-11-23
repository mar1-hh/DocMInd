import express, { type ErrorRequestHandler } from 'express'
import { ZodError, flattenError } from 'zod'
import collections from './routes/collections.route.js'
import { AppError } from './utils/AppError.js'
import { indexFiles } from './routes/indexing.js'

const app = express()
app.set('trust proxy', 1)
app.use(express.json())
app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/internal/index-files', indexFiles)
app.use('/api/collections', collections)

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return _next(error)
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ code: error.code, message: error.message })
  } else if (error instanceof ZodError) {
    res.status(400).json({ errors: flattenError(error) })
  } else if (error.type === 'entity.parse.failed') {
    res.status(400).json({ code: 'INVALID_JSON', message: 'Invalid JSON body' })
  } else if (error.type === 'entity.too.large') {
    res.status(413).json({ code: 'BODY_TOO_LARGE', message: 'Request body too large' })
  } else {
    console.error(error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
app.use(handleError)
export default app
