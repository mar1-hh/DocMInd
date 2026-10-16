import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from '../utils/AppError.js'

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorization = req.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    return next(
      new AppError(401, 'UNAUTHORIZED', 'Access token required')
    )
  }

  const token = authorization.slice(7)

  try {
    const secret = process.env.JWT_ACCESS_SECRET

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not defined')
    }

    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256']
    })

    if (typeof payload === 'string' || typeof payload.sub !== 'string')
        throw new AppError(401, 'INVALID_TOKEN', 'Invalid token payload')

    req.userId = payload.sub

    next()
  } catch (error) {
    next(error)
  }
}