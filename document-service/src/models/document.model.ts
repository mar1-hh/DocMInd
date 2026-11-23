import { model, Schema } from 'mongoose'

const schema = new Schema({
  collectionId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  originalFilename: { type: String, required: true },
  storageKey: { type: String, required: true, immutable: true, unique: true },
  size: { type: Number, required: true },
  contentType: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now, required: true },
  indexStatus: { type: String, enum: ['pending', 'indexing', 'ready', 'failed'], default: 'pending' },
  indexError: String,
  indexAttempt: { type: String, select: false },
  indexLease: { type: Date, select: false },
  indexPassages: { type: [Schema.Types.Mixed], default: undefined, select: false },
  state: { type: String, enum: ['uploading', 'ready', 'deleting'], required: true },
})

schema.index({ collectionId: 1, state: 1, uploadedAt: -1, _id: -1 })
schema.index({ state: 1, indexStatus: 1, indexLease: 1 })
export default model('Document', schema)
