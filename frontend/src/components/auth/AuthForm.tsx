import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Divider, Link, Stack, TextField, Typography } from '@mui/material'
import { loginSchema, registerSchema } from '../../validation/auth'
import { PasswordField } from './PasswordField'
import { authStore } from '../../auth/authStore'
import { useAuth } from '../../auth/useAuth'
import { ApiError, errorMessage } from '../../api/auth'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const register = mode === 'register'
  const [values, setValues] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const disabled = pending || auth.loggingOut
  const update = (field: keyof typeof values, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: '', ...(field === 'password' ? { confirmPassword: '' } : {}) }))
    setApiError(null)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || auth.loggingOut) return
    const form = event.currentTarget
    const result = (register ? registerSchema : loginSchema).safeParse(values)
    const nextErrors: Record<string, string> = {}
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0])
        nextErrors[field] ??= issue.message
      }
    }
    setErrors(nextErrors)
    setApiError(null)
    if (!result.success) {
      const firstField = form.elements.namedItem(Object.keys(nextErrors)[0])
      if (firstField instanceof HTMLElement) firstField.focus()
      return
    }
    submitting.current = true
    setPending(true)
    try {
      if (register) {
        await authStore.register({ name: values.name, email: values.email, password: values.password })
        navigate('/login', { replace: true, state: { registered: true, from: location.state?.from } })
      } else {
        await authStore.login({ email: values.email, password: values.password })
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors)
        const firstField = form.elements.namedItem(Object.keys(error.fieldErrors)[0] ?? '')
        // Wait for the pending fieldset to be enabled again before moving focus.
        if (firstField instanceof HTMLElement) requestAnimationFrame(() => firstField.focus())
      }
      setApiError(errorMessage(error))
    } finally {
      submitting.current = false
      setPending(false)
    }
  }
  return (
    <>
      <Typography component="h1" variant="h1" sx={{ fontSize: { xs: '1.8rem', sm: '2.2rem' } }}>{register ? 'Create your account' : 'Welcome back'}</Typography>
      <Typography color="text.secondary" sx={{ mt: 1.25, mb: 4, fontSize: { xs: 16, sm: 19 } }}>{register ? 'Start organizing your documents.' : 'Sign in to your DocMind account.'}</Typography>
      <Box component="form" noValidate onSubmit={submit}>
        <Box component="fieldset" disabled={disabled} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }} aria-busy={disabled}>
        <Stack spacing={register ? 2.5 : 3}>
          {!register && location.state?.registered && <Alert severity="success">Your account was created. Sign in to continue.</Alert>}
          {(apiError || auth.error) && <Alert severity="error">{apiError ?? auth.error}</Alert>}
          {auth.logoutFailed && <Button onClick={() => void authStore.logout()}>Retry sign out</Button>}
          {register && <TextField id="name" name="name" label="Name" placeholder="Your full name" autoComplete="name" required value={values.name} onChange={(event) => update('name', event.target.value)} error={Boolean(errors.name)} helperText={errors.name} />}
          <TextField id="email" name="email" label="Email" placeholder="you@example.com" type="email" autoComplete="email" required value={values.email} onChange={(event) => update('email', event.target.value)} error={Boolean(errors.email)} helperText={errors.email} />
          <PasswordField id="password" label="Password" value={values.password} onChange={(value) => update('password', value)} error={errors.password} autoComplete={register ? 'new-password' : 'current-password'} />
          {register && <PasswordField id="confirmPassword" label="Confirm password" value={values.confirmPassword} onChange={(value) => update('confirmPassword', value)} error={errors.confirmPassword} autoComplete="new-password" />}
          <Button type="submit" variant="contained" fullWidth disabled={disabled} loading={disabled}>{auth.loggingOut ? 'Signing out…' : pending ? (register ? 'Creating account…' : 'Signing in…') : register ? 'Create account' : 'Sign in'}</Button>
        </Stack>
        </Box>
      </Box>
      <Divider sx={{ my: 3.5 }} />
      <Typography color="text.secondary" sx={{ textAlign: 'center', fontSize: 14, lineHeight: 1.8 }}>
        {register ? 'Already have an account? ' : 'New to DocMind? '}
        {pending ? (register ? 'Sign in.' : 'Create an account.') : <Link component={RouterLink} to={register ? '/login' : '/register'} state={{ from: location.state?.from }}>{register ? 'Sign in.' : 'Create an account.'}</Link>}
      </Typography>
    </>
  )
}
