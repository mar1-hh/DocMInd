import express, { type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'

const app = express()

app.use(express.json())
app.use(cookieParser())

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' })
})

export default app
