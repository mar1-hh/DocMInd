import mongoose from "mongoose";

const connectDb = async () => {
    const uri = process.env.MONGO_URI
    if (!uri)
        throw new Error("Mongo uri is not defined")
    await mongoose.connect(uri)
    console.log('Mongodb connected successefully')
}

export default connectDb