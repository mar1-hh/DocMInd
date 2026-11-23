import { model, Schema } from 'mongoose'

const schema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  deleting: Boolean,
  latestChat: { type: Schema.Types.Mixed, select: false },
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
}, { timestamps: true })

schema.index({ ownerId: 1, createdAt: -1, _id: -1 })

export default model('Collection', schema)
