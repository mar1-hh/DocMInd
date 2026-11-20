import { useState } from 'react'
import { Alert, Avatar, Divider, ListSubheader, Menu, MenuItem, Snackbar } from '@mui/material'
import { authStore } from '../../auth/authStore'
import { useAuth } from '../../auth/useAuth'
import { errorMessage, meResponseSchema, parseResponse } from '../../api/auth'
import { WorkspaceIcon } from './WorkspaceIcon'

export function AccountMenu() {
  const { user } = useAuth()
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [checking, setChecking] = useState(false)
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null)
  async function checkSession() {
    if (checking) return
    setAnchor(null)
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
  if (!user) return null
  return <>
    <button type="button" className="workspace-account" aria-label={`Account for ${user.name}`}
      aria-haspopup="menu" aria-expanded={Boolean(anchor)} aria-controls={anchor ? 'account-menu' : undefined}
      onClick={event => setAnchor(event.currentTarget)}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 14 }}>{user.name.trim().slice(0, 1).toUpperCase()}</Avatar>
      <span>{user.name}</span><WorkspaceIcon name="next" />
    </button>
    <Menu id="account-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
      slotProps={{ list: { 'aria-label': 'Account' } }}>
      <ListSubheader sx={{ color: 'text.secondary', lineHeight: 1.5, py: 1, overflowWrap: 'anywhere' }}>Signed in as {user.email}</ListSubheader>
      <Divider />
      <MenuItem onClick={checkSession} disabled={checking}>Check session</MenuItem>
      <MenuItem onClick={() => { setAnchor(null); void authStore.logout() }}>Sign out</MenuItem>
    </Menu>
    {notice && <Snackbar open autoHideDuration={4500} onClose={() => setNotice(null)}>
      <Alert role="status" severity={notice.error ? 'error' : 'success'}>{notice.message}</Alert>
    </Snackbar>}
  </>
}
