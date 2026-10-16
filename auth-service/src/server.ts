import 'dotenv/config'
import app from './app.js'
import connectDb from './config/db.js'

const PORT = Number(process.env.PORT)

const startServer = async () => {
    try
    {
        await connectDb()
        app.listen(PORT, () => {
            console.log(`Auth service running on port ${PORT}`)
        })
    }
    catch (err)
    {
        console.error('Server startup failed:', err)
        process.exit(1)
    }
}

startServer()