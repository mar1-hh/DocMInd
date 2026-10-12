import User from '../models/user.model.js'
import bcrypt from 'bcrypt'

interface userData {
    name: string,
    email: string,
    password: string
}

export const registerUser = async (data: userData) => {
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