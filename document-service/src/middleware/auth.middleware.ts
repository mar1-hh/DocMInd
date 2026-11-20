import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { isObjectIdOrHexString } from 'mongoose'
import { AppError } from '../utils/AppError.js'

export const authenticate: RequestHandler = (req, res, next) => {
  const authorization = req.headers.authorization
  if (!authorization?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Access token required')
  }
  const secret = process.env.JWT_ACCESS_SECRET
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured')

  try {
    const payload = jwt.verify(authorization.slice(7), secret, { algorithms: ['HS256'] })
    if (typeof payload === 'string' || typeof payload.sub !== 'string' ||
        !isObjectIdOrHexString(payload.sub) || typeof payload.exp !== 'number') {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid token payload')
    }
    res.locals.ownerId = payload.sub
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired')
    if (error instanceof jwt.JsonWebTokenError) throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token')
    throw error
  }
  next()
}
