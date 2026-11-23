import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, IconButton, LinearProgress, Snackbar, Tooltip } from '@mui/material'
import { listCollections, type CollectionList } from '../api/collections'
import { errorMessage } from '../api/auth'
import { useAuth } from '../auth/useAuth'
import { WorkspaceLayout } from '../components/collections/WorkspaceLayout'
import { CollectionDialog, type Action } from '../components/collections/CollectionDialog'
import { WorkspaceIcon } from '../components/collections/WorkspaceIcon'

import { Status, Timestamp } from '../components/collections/Status'

function Workspace({ recentChats }: { recentChats: boolean }) {
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

  useEffect(() => {
    if (loading || !data || !(data.collections.some(c => c.status === 'processing') || data.recent.some(d => ['indexing', 'pending'].includes(d.status)))) return
    const timer = window.setTimeout(() => setQuery({ page: query.page }), 4000)
    return () => window.clearTimeout(timer)
  }, [loading, data, query.page])

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

  if (recentChats) return <WorkspaceLayout title="Recent chats" intro="Return to the latest conversation in each collection.">
    {loading && <LinearProgress aria-label="Loading recent chats" />}
    {error && <Alert severity="error" action={<Button onClick={() => setQuery({ page: 1 })}>Retry</Button>}>{error}</Alert>}
    {data && (data.chats.length ? data.chats.map(chat => <Link className="recent-chat-row" key={chat.id} to={'/collections/' + chat.id}>
      <strong>{chat.name}</strong><em>“{chat.question}”</em><Timestamp value={chat.at} />
    </Link>) : <p>No questions yet. Open a collection to start a chat.</p>)}
  </WorkspaceLayout>
  return <WorkspaceLayout title="Collections" intro="Group documents by subject, then ask questions and check every answer against its source page." action={
    <Button ref={newButton} variant="contained" onClick={() => setAction({ kind: 'create' })}>New collection</Button>
  }>
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
        <div className="collection-rows">{data.collections.map(item =>
          <article key={item.id} className="collection-row" aria-labelledby={'title-' + item.id}>
            <div><h2 id={'title-' + item.id}><Link to={'/collections/' + item.id}>{item.name}</Link></h2>
              <span>{item.count} {item.count === 1 ? 'document' : 'documents'}</span></div>
            <div className="last-question">{item.latestChat ? <><em>“{item.latestChat.question}”</em><Timestamp value={item.latestChat.at} /></>
              : <>{item.description && <p>{item.description}</p>}<small>Created <Timestamp value={item.createdAt} /></small></>}</div>
            <Status value={item.status} />
            <div className="row-tools">{(['edit', 'delete'] as const).map(kind => {
              const label = kind === 'edit' ? 'Edit' : 'Delete'
              return <Tooltip title={label} key={kind}><IconButton size="small" aria-label={label + ' ' + item.name}
                onClick={() => setAction({ kind, collection: item })}><WorkspaceIcon name={kind === 'edit' ? 'edit' : 'trash'} /></IconButton></Tooltip>
            })}</div>
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
    {data && <section className="recent-files" aria-labelledby="recent-heading"><h2 id="recent-heading">Recently added</h2>
      {data.recent.length ? data.recent.map(file => <div key={file.id} className="recent-file">
        <Link className="file-link" to={`/collections/${file.collectionId}/documents/${file.id}/view`}><WorkspaceIcon name="file" />{file.filename}</Link>
        <Link aria-label={'Open collection ' + file.collectionName} to={'/collections/' + file.collectionId}>{file.collectionName}</Link>
        <Status value={file.status} /><Timestamp value={file.uploadedAt} />
      </div>) : <p>Uploaded PDFs will appear here.</p>}
    </section>}
    {action && <CollectionDialog action={action} onClose={() => setAction(null)} onSaved={saved} />}
    <Snackbar open={!!notice} autoHideDuration={4500} onClose={() => setNotice('')}>
      <Alert severity="success" role="status" onClose={() => setNotice('')}>{notice}</Alert>
    </Snackbar>
  </WorkspaceLayout>
}

export function CollectionsPage({ recentChats = false }: { recentChats?: boolean }) {
  const { user } = useAuth()
  return user && <Workspace key={user.id + String(recentChats)} recentChats={recentChats} />
}
