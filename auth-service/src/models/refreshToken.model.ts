import mongoose, { Schema } from 'mongoose'

interface IRefreshToken {
  userId: mongoose.Types.ObjectId
  tokenHash: string
  usedTokenHashes: string[]
  revokedAt: Date | null
  expiresAt: Date
}

const refreshTokenSchema = new Schema<IRefreshToken>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true
  },
  usedTokenHashes: {
    type: [String],
    default: []
  },
  revokedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, { timestamps: true })

refreshTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
)

export default mongoose.model<IRefreshToken>('RefreshToken', refreshTokenSchema)