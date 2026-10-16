import { randomBytes, createHash } from "node:crypto";

export const generateRefreshToken = () => {
    return (randomBytes(32).toString('hex'))
}

export const hashRefreshToken = (token: string) => {
    return (createHash('sha256').update(token).digest('hex'))
}
