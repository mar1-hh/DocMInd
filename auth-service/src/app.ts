import express, { type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import authRouter from './routes/auth.route.js'

const app = express()

app.use(express.json())
app.use(cookieParser())

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' })
})

app.use('/api/auth', authRouter)

export default app
