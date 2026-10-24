import { useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { AuthLayout } from '../components/auth/AuthLayout'
import { authStore } from '../auth/authStore'
import { useAuth } from '../auth/useAuth'
import { errorMessage, meResponseSchema, parseResponse } from '../api/auth'

export function AccountPage() {
  const { user } = useAuth()
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  async function checkSession() {
    if (checking) return
    setChecking(true)
    setNotice(null)
    try {
      parseResponse(meResponseSchema, await authStore.authenticatedRequest('/me'))
      setNotice({ message: 'Your session is active.', error: false })
    } catch (error) {
      setNotice({ message: errorMessage(error), error: true })
    } finally {
      setChecking(false)
    }
  }
  return <AuthLayout><Stack spacing={3}>
    <Typography variant="h1" component="h1">Welcome, {user?.name}</Typography>
    <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>Signed in as {user?.email}</Typography>
    {notice && <Alert severity={notice.error ? 'error' : 'success'} role="status">{notice.message}</Alert>}
    <Button variant="outlined" disabled={checking} onClick={() => void checkSession()}>{checking ? 'Checking session…' : 'Check session'}</Button>
    <Button variant="contained" onClick={() => void authStore.logout()}>Sign out</Button>
  </Stack></AuthLayout>
}
