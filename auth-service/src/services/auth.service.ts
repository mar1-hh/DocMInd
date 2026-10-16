import User from '../models/user.model.js'
import RefreshToken from '../models/refreshToken.model.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { generateRefreshToken, hashRefreshToken } from '../utils/refreshToken.js'
import { AppError } from '../utils/AppError.js'
import { access } from 'node:fs'


interface registerData {
    name: string,
    email: string,
    password: string
}

interface loginData {
    email: string,
    password: string
}

export const registerUser = async (data: registerData) => {
    const {name, email, password} = data

    const isExist = await User.findOne({email})
    if (isExist)
        throw new Error('EMAIL_ALREADY_EXISTS')
    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await User.create({
        ...data, password: hashedPassword
    })
    return ({
        id: user.id,
        email,
        name
    })
}

export const loginUser = async (data: loginData) => {
    const {email, password} = data

    const secret = process.env.JWT_ACCESS_SECRET
    if (!secret)
        throw new Error('JWT_ACCESS_SECRET is not defined')
    const user = await User.findOne({email}).select('+password')
    const isCorrect = (user === null ? false : await bcrypt.compare(password, user.password))
    if (!user || !isCorrect)
        throw new Error('invalid username or password')
    const userToken = {
        sub: user.id,
    }
    const token = jwt.sign(userToken, secret, { expiresIn: '15m', algorithm: 'HS256' })
    const refreshToken = generateRefreshToken()
    const tokenHash = hashRefreshToken(refreshToken)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    RefreshToken.create({
        userId: user.id,
        tokenHash,
        expiresAt
    })
    return ({accesstoken: token, refreshToken, user: {
        id: user.id,
        email: user.email,
        name: user.name
    }})
}

export const refreshAccessToken = async (token: string) => {
    const secret = process.env.JWT_ACCESS_SECRET
    if (!secret)
        throw new Error('JWT_ACCESS_SECRET is not defined')
    const hashedToken = hashRefreshToken(token)
    const newRefreshToken = generateRefreshToken()
    const newHashedRefresh = hashRefreshToken(newRefreshToken)
    const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
    )
    const isExist = await RefreshToken.findOneAndUpdate(
        {
            tokenHash: hashedToken,
            expiresAt : {$gt : new Date()}
        },
        {
            $set: {
                tokenHash: newHashedRefresh,
                expiresAt
            }
        }
    )
    if (!isExist || isExist.expiresAt <= new Date())
    {
        throw new AppError(401,
      'INVALID_REFRESH_TOKEN',
      'Invalid or expired refresh token')
    }
    const newToken = jwt.sign({sub: isExist.userId}, secret, {expiresIn: '15m', algorithm: 'HS256'})
    return ({accessToken: newToken, newRefreshToken})
}

export const logoutUser = async (refToken: string) => {
    const tokenHash = hashRefreshToken(refToken)
    await RefreshToken.deleteOne({tokenHash})
}

export const getCurrentUser = async (userId: string) => {
    const user = await User.findById(userId)

    if (!user)
        throw (new AppError(404, 'USER_NOT_FOUND', 'User not found'))
    return ({
        id: user.id,
        email: user.email,
        name: user.name
    })
}
