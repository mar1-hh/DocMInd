import { z } from 'zod'
import { authStore } from '../auth/authStore'
import { jsonPost, parseResponse } from './auth'

export const reply = z.object({
  answer: z.string(),
  statements: z.array(z.object({ text: z.string(), citations: z.array(z.int().positive()) })),
  sources: z.array(z.object({ documentId: z.string(), filename: z.string(), page: z.int().positive(), snippet: z.string(), highlight: z.string() })),
})
export type Reply = z.infer<typeof reply>

export async function askCollection(collectionId: string, question: string, documentIds: string[]) {
  return parseResponse(reply, await authStore.authenticatedRequest('', {
    ...jsonPost({ collectionId, question, documentIds }), signal: AbortSignal.timeout(120_000),
  }, 'chat'))
}
