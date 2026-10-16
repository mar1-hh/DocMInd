import express from 'express'
import { registerHandling, longinHandling, refreshHandling, logoutHandling,
    getMeHandling
 } from '../controllers/auth.controllers.js'
import {z} from 'zod'
import { validate } from '../middleware/validate.middleware.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authLimiter } from '../middleware/rateLimit.middleware.js'

const router = express.Router()

const registerSchema = z.object({
    name: z.string().trim().min(3).max(50),
    email: z.email(),
    password: z.string().min(8).max(128)
})

const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(1).max(128)
})

router.post('/register', authLimiter, validate(registerSchema), registerHandling)
router.post('/login', authLimiter, validate(loginSchema), longinHandling)
router.post('/refresh', refreshHandling)
router.post('/logout', logoutHandling)
router.get('/me', authenticate, getMeHandling)


export default router