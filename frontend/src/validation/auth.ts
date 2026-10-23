import { z } from 'zod'

// Mirror auth-service/src/routes/auth.route.ts; confirmation is checked only in the UI.
const email = z.email('Enter a valid email address.')
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(128, 'Use at most 128 characters.'),
})
export const registerSchema = z.object({
  name: z.string().trim().min(3, 'Use at least 3 characters.').max(50, 'Use at most 50 characters.'),
  email,
  password: z.string().min(8, 'Use at least 8 characters.').max(128, 'Use at most 128 characters.'),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords must match.',
})
