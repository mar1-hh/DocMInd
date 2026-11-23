import { z } from 'zod'
import { reply } from './chat'
import { authStore } from '../auth/authStore'
import { jsonPost, parseResponse } from './auth'

const collection = z.object({
  id: z.string(), name: z.string(), description: z.string().optional(),
  createdAt: z.iso.datetime(),
  latestChat: z.object({ question: z.string(), at: z.iso.datetime(), reply: reply.optional() }).optional(),
})
const list = z.object({
  collections: z.array(collection.extend({ count: z.int(), status: z.string() })),
  recent: z.array(z.object({ id: z.string(), filename: z.string(), collectionName: z.string(), collectionId: z.string(), uploadedAt: z.iso.datetime(), status: z.string() })),
  chats: z.array(z.object({ id: z.string(), name: z.string(), question: z.string(), at: z.iso.datetime() })), page: z.int(), hasMore: z.boolean(), limit: z.int(),
})
export type Collection = z.infer<typeof collection>
export type CollectionList = z.infer<typeof list>
export const collectionInput = z.object({
  name: z.string().trim().min(1, 'Enter a collection name.').max(100, 'Use at most 100 characters.'),
  description: z.string().max(500, 'Use at most 500 characters.'),
})
type Input = z.infer<typeof collectionInput>
const call = (path: string, init?: RequestInit) => authStore.authenticatedRequest(path, init, 'collections')

export async function listCollections(page: number, signal: AbortSignal) {
  return parseResponse(list, await call(`/dashboard?page=${page}&limit=9`, { signal }))
}
export async function saveCollection(input: Input, id?: string) {
  const path = id ? '/' + encodeURIComponent(id) : ''
  return parseResponse(z.object({ collection }), await call(path, {
    ...jsonPost(input), method: id ? 'PATCH' : 'POST',
  }))
}
export function deleteCollection(id: string) {
  return call('/' + encodeURIComponent(id), { method: 'DELETE' })
}

export async function getCollection(id: string, signal: AbortSignal) {
  return parseResponse(z.object({ collection }), await call('/' + encodeURIComponent(id), { signal })).collection
}
