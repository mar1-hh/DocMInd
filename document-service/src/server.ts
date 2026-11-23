import 'dotenv/config'
import mongoose from 'mongoose'
import app from './app.js'
import { initializeStorage } from './storage/documents.js'

const uri = process.env.MONGO_URI
if (!uri || !process.env.JWT_ACCESS_SECRET) throw new Error('Configure MONGO_URI and JWT_ACCESS_SECRET')
await mongoose.connect(uri)
await initializeStorage()
const port = Number(process.env.PORT ?? 3002)
app.listen(port, () => console.log(`Document service listening on port ${port}`))
