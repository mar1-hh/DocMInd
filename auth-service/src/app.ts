import express, { type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import authRouter from './routes/auth.route.js'
import { errorHandler } from './middleware/error.middleware.js'

const app = express()


app.set('trust proxy', 1)

app.use(express.json())
app.use(cookieParser())

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' })
})

app.use('/api/auth', authRouter)
app.use(errorHandler)

export default app
