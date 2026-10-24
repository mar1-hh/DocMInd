import { z } from 'zod'

export const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string() })
export type User = z.infer<typeof userSchema>
export type LoginInput = { email: string; password: string }
export type RegisterInput = LoginInput & { name: string }
export const loginResponseSchema = z.object({ accesstoken: z.string().min(1), user: userSchema })
export const refreshResponseSchema = z.object({ accessToken: z.string().min(1) })
export const meResponseSchema = z.object({ user: userSchema })

const errorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  errors: z.object({
    fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
    formErrors: z.array(z.string()),
  }).optional(),
})

export class ApiError extends Error {
  status: number
  code?: string
  fieldErrors: Record<string, string>

  constructor(message: string, status = 0, code?: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export function createApi(fetcher: typeof fetch) {
  return async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response
    try {
      response = await fetcher(`/api/auth${path}`, {
        ...init,
        credentials: 'include',
        signal: init.signal ?? AbortSignal.timeout(15_000),
      })
    } catch {
      throw new ApiError('Unable to reach the authentication service. Please try again.')
    }
    if (response.status === 204) return undefined
    const data: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      const parsed = errorSchema.safeParse(data)
      const body = parsed.success ? parsed.data : undefined
      const fields: Record<string, string> = {}
      for (const [field, messages] of Object.entries(body?.errors?.fieldErrors ?? {})) {
        if (messages?.[0]) fields[field] = messages[0]
      }
      if (body?.code === 'EMAIL_ALREADY_EXISTS') fields.email = 'This email is already registered.'
      const fallback = response.status === 429
        ? 'Too many requests. Please try again later.'
        : response.status >= 500
          ? 'The authentication service is unavailable. Please try again.'
          : 'The request could not be completed. Please try again.'
      throw new ApiError(body?.message ?? body?.errors?.formErrors[0] ?? (Object.keys(fields).length ? 'Please check the highlighted fields.' : fallback), response.status, body?.code, fields)
    }
    return data
  }
}

export function jsonPost(data?: unknown): RequestInit {
  return {
    method: 'POST',
    ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  }
}

export function parseResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError('The authentication service returned an unexpected response. Please try again.')
  return result.data
}
