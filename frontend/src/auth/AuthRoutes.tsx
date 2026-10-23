import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { AuthLayout } from '../components/auth/AuthLayout'
import { authStore } from './authStore'
import { useAuth } from './useAuth'

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const { status, error } = useAuth()
  useEffect(() => { void authStore.restore() }, [])
  if (status === 'restoring') {
    return <AuthLayout><Box role="status" sx={{ textAlign: 'center' }}><CircularProgress size={28} /><Typography sx={{ mt: 2 }}>Restoring your session…</Typography></Box></AuthLayout>
  }
  if (status === 'error') {
    return <AuthLayout><Stack spacing={2}><Alert severity="error">{error}</Alert><Button variant="contained" onClick={() => void authStore.retryRestoration()}>Retry session restoration</Button><Button onClick={() => authStore.goToSignIn()}>Go to sign in</Button></Stack></AuthLayout>
  }
  return children
}

export function ProtectedRoute() {
  const { user } = useAuth()
  const location = useLocation()
  return user ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />
}

export function PublicRoute() {
  const { user } = useAuth()
  const location = useLocation()
  const from: unknown = location.state?.from
  const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/login' && from !== '/register' ? from : '/'
  return user ? <Navigate to={destination} replace /> : <Outlet />
}
