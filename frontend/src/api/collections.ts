import { z } from 'zod'
import { authStore } from '../auth/authStore'
import { jsonPost, parseResponse } from './auth'

const collection = z.object({
  id: z.string(), name: z.string(), description: z.string().optional(),
  createdAt: z.iso.datetime(),
})
const list = z.object({
  collections: z.array(collection), page: z.int(), hasMore: z.boolean(), limit: z.int(),
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
  return parseResponse(list, await call(`?page=${page}&limit=9`, { signal }))
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
