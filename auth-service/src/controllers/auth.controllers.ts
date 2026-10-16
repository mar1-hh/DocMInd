import { type Request, type Response, type NextFunction } from "express";
import { registerUser, loginUser, refreshAccessToken, logoutUser,
    getCurrentUser
 } from "../services/auth.service.js";
import { AppError } from "../utils/AppError.js";

export const registerHandling = async (req: Request, res: Response) => {
    try
    {
        const user = await registerUser(req.body)
        res.status(201).json(user)
    }
    catch (error)
    {
        if (error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS')
            {
            return (res.status(409).json({
                success: false,
                code: 'EMAIL_ALREADY_EXISTS',
                message: 'Email is already registered'
            }))
        }

        res.status(500).json({
            success: false,
            message: 'Internal server error'
        })
  }
}

export const longinHandling = async (req: Request, res: Response, next: NextFunction) => {
    try
    {
        const {refreshToken, ...data} = await loginUser(req.body)
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth',
            maxAge: 7 * 24 * 60 * 60 * 1000
        })
        res.status(200).json(data)
    }
    catch (err)
    {
        next(err)
    }
}

export const refreshHandling = async (req: Request, res: Response, next: NextFunction) => {
    try
    {
        const refreshToken = req.cookies?.refreshToken
        if (typeof refreshToken !== 'string' || !refreshToken) {
            throw new AppError (
                401,
                'MISSING_REFRESH_TOKEN',
                'Refresh token is missing'
            )
        }
        const result = await refreshAccessToken(refreshToken)
        res.cookie('refreshToken', result.newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth',
            maxAge: 7 * 24 * 60 * 60 * 1000
        })
        res.status(200).json({accessToken: result.accessToken})

    } catch (err)
    {
        next(err)
    }
}

export const logoutHandling = async (req: Request, res: Response, next: NextFunction) => {
    try
    {
        const refreshToken = req.cookies?.refreshToken
        if (typeof refreshToken === 'string' && refreshToken)
            await logoutUser(refreshToken)
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth'
        })
        res.status(204).send()
    }
    catch (err)
    {
        next(err)
    }
}

export const getMeHandling = async (req: Request, res: Response, next: NextFunction) => {
    try
    {
        if (!req.userId)
            throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
        const user = await getCurrentUser(req.userId)
        return (res.status(200).json({user}))
    }
    catch (err)
    {
        next(err)
    }
}