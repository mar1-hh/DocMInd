import { type Request, type Response } from "express";
import { registerUser } from "../services/auth.service.js";

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
