import mongoose  from "mongoose";

interface IUser {
    name : string,
    email: string,
    password: string
}

const userSchma = new mongoose.Schema<IUser>({
    name: {
        type: String,
        required: true,
        minlength: 3,
        maxlength: 50,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        select: false
    }
}, {
    timestamps: true
})

export default mongoose.model<IUser>('User', userSchma)