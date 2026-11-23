import { useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch, useColorScheme } from '@mui/material'
import { AccountMenu } from './AccountMenu'
import { Wordmark } from '../Wordmark'
import '../../pages/collections.css'

export function WorkspaceLayout({ title, action, children, detail, intro }: {
  title: string; action?: ReactNode; children: ReactNode; detail?: boolean; intro?: string
}) {
  const { mode, setMode } = useColorScheme()
  const [settings, setSettings] = useState(false)
  return <div className="collections-workspace">
    <header className="topbar"><Wordmark />
      <nav aria-label="Workspace">
        <NavLink to="/collections">Collections</NavLink><NavLink to="/recent-chats">Recent chats</NavLink>
        <button onClick={() => setSettings(true)}>Settings</button>
      </nav>
      <AccountMenu />
    </header>
    <main className={detail ? 'detail-main' : 'dashboard-main'}>
      {detail && <nav className="breadcrumb" aria-label="Breadcrumb"><Link aria-label="Back to collections" to="/collections">Collections</Link> / {title}</nav>}
      <header className="page-heading"><div><h1>{title}</h1>{intro && <p>{intro}</p>}</div>{action}</header>
      {children}
    </main>
    <Dialog open={settings} onClose={() => setSettings(false)} fullWidth maxWidth="xs" aria-labelledby="settings-title">
      <DialogTitle id="settings-title">Settings</DialogTitle>
      <DialogContent><FormControlLabel label="Dark mode" control={<Switch checked={mode === 'dark'}
        onChange={e => setMode(e.target.checked ? 'dark' : 'light')} slotProps={{ input: { role: 'switch' } }} />} /></DialogContent>
      <DialogActions><Button onClick={() => setSettings(false)}>Done</Button></DialogActions>
    </Dialog>
  </div>
}
