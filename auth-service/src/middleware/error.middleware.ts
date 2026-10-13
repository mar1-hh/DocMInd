import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/AppError.js'


export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return (res.status(err.statusCode).json({
      code: err.code,
      message: err.message
    }))
  }

  console.error(err)

  res.status(500).json({
    message: 'Internal server error'
  })
}