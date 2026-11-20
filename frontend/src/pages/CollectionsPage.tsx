import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, FormControlLabel, Switch, IconButton, LinearProgress, Snackbar, Tooltip } from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import { listCollections, type CollectionList } from '../api/collections'
import { errorMessage } from '../api/auth'
import { useAuth } from '../auth/useAuth'
import { AccountMenu } from '../components/collections/AccountMenu'
import { CollectionDialog, type Action } from '../components/collections/CollectionDialog'
import { WorkspaceIcon } from '../components/collections/WorkspaceIcon'
import './collections.css'

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

function Workspace() {
  const { mode, setMode } = useColorScheme()
  const [query, setQuery] = useState({ page: 1 })
  const [result, setResult] = useState<{ query: typeof query; data?: CollectionList; error?: string }>()
  const [action, setAction] = useState<Action | null>(null)
  const [notice, setNotice] = useState('')
  const newButton = useRef<HTMLButtonElement>(null)
  const focusAfterDelete = useRef(false)
  const data = result?.query.page === query.page ? result.data : undefined
  const loading = result?.query !== query
  const error = !loading && result?.error

  useEffect(() => {
    const controller = new AbortController()
    listCollections(query.page, controller.signal).then(data => {
      if (controller.signal.aborted) return
      if (query.page > 1 && data.collections.length === 0) {
        setQuery({ page: 1 })
        return
      }
      setResult({ query, data })
      if (focusAfterDelete.current) {
        newButton.current?.focus()
        focusAfterDelete.current = false
      }
    }).catch(cause => {
      if (!controller.signal.aborted) setResult({ query, error: errorMessage(cause) })
    })
    return () => controller.abort()
  }, [query])

  function saved() {
    if (!action) return
    let page = query.page
    if (action.kind === 'create') page = 1
    if (action.kind === 'delete') {
      focusAfterDelete.current = true
      if (data?.collections.length === 1) page = Math.max(1, page - 1)
    }
    setNotice({ create: 'Collection created.', edit: 'Collection updated.', delete: 'Collection deleted.' }[action.kind])
    setAction(null)
    setQuery({ page })
  }

  return <div className="collections-workspace">
    <aside className="workspace-sidebar">
      <div className="workspace-brand"><WorkspaceIcon name="book" />DocMind</div>
      <nav aria-label="Workspace"><Link to="/collections" className="workspace-current" aria-current="page">
        <WorkspaceIcon name="folder" />Collections
      </Link></nav>
      <AccountMenu />
    </aside>
    <main className="collections-main">
      <header className="collections-heading"><h1>Your collections</h1>
        <div className="workspace-controls">
          <FormControlLabel label="Dark mode" control={<Switch size="small" checked={mode === 'dark'}
            onChange={event => setMode(event.target.checked ? 'dark' : 'light')} slotProps={{ input: { role: 'switch' } }} />} />
          <Button ref={newButton} variant="contained" startIcon={<WorkspaceIcon name="plus" />}
          onClick={() => setAction({ kind: 'create' })}>New collection</Button>
        </div>
      </header>
      <section aria-label="Collection list" aria-busy={loading}>
        {loading && <LinearProgress aria-label="Loading collections" />}
        {error && <Alert severity="error" action={<Button onClick={() => setQuery({ page: query.page })}>Retry</Button>}>{error}</Alert>}
        {data && data.collections.length === 0 && <div className="collections-empty">
          <span className="empty-folder"><WorkspaceIcon name="folder" /></span>
          <h2>No collections yet</h2>
          <p>Create a collection for a project or subject.</p>
          <Button variant="outlined" onClick={() => setAction({ kind: 'create' })}>Create your first collection</Button>
        </div>}
        {!!data?.collections.length && <>
          <div className="collections-sort">Newest first</div>
          <div className="collections-grid">{data.collections.map(item =>
            <article key={item.id} className="collection-card" aria-labelledby={`title-${item.id}`}>
              <span className="card-folder"><WorkspaceIcon name="folder" /></span>
              <h2 id={`title-${item.id}`}>{item.name}</h2>
              {item.description && <p>{item.description}</p>}
              <footer><time dateTime={item.createdAt}>Created {dateFormat.format(new Date(item.createdAt))}</time>
                <div className="collection-actions">{(['edit', 'delete'] as const).map(kind => {
                  const label = kind === 'edit' ? 'Edit' : 'Delete'
                  return <Tooltip title={label} key={kind}><IconButton size="small" aria-label={`${label} ${item.name}`}
                    onClick={() => setAction({ kind, collection: item })}><WorkspaceIcon name={kind === 'edit' ? 'edit' : 'trash'} /></IconButton></Tooltip>
                })}</div>
              </footer>
            </article>
          )}</div>
          {(query.page > 1 || data.hasMore) && <nav className="collections-pages" aria-label="Collection pages">
            <Button disabled={loading || query.page === 1} startIcon={<WorkspaceIcon name="previous" />}
              onClick={() => setQuery({ page: query.page - 1 })}>Previous</Button>
            <span aria-live="polite">Page {query.page}</span>
            <Button disabled={loading || !data.hasMore || query.page >= 10000} endIcon={<WorkspaceIcon name="next" />}
              onClick={() => setQuery({ page: query.page + 1 })}>Next</Button>
          </nav>}
        </>}
      </section>
    </main>
    {action && <CollectionDialog action={action} onClose={() => setAction(null)} onSaved={saved} />}
    <Snackbar open={!!notice} autoHideDuration={4500} onClose={() => setNotice('')}>
      <Alert severity="success" role="status" onClose={() => setNotice('')}>{notice}</Alert>
    </Snackbar>
  </div>
}

export function CollectionsPage() {
  const { user } = useAuth()
  return user && <Workspace key={user.id} />
}
