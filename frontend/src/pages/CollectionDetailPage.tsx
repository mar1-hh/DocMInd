import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, Button, Checkbox, IconButton, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, useMediaQuery, LinearProgress } from '@mui/material'
import { errorMessage } from '../api/auth'
import { getCollection, type Collection } from '../api/collections'
import { deleteDocument, downloadPdf, indexDocument, listDocuments, uploadPdf, type CollectionDocument } from '../api/documents'
import { useAuth } from '../auth/useAuth'
import { WorkspaceLayout } from '../components/collections/WorkspaceLayout'
import { ReadingPanel } from '../components/chat/ReadingPanel'
import { ChatPanel } from '../components/chat/ChatPanel'

import { Status } from '../components/collections/Status'
import { WorkspaceIcon } from '../components/collections/WorkspaceIcon'

function Documents({ id }: { id: string }) {
  const mobile = useMediaQuery('(max-width: 960px)')
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ version: number; collection?: Collection; files?: CollectionDocument[]; error?: string }>()
  const [excluded, setExcluded] = useState<string[]>([])
  const selected = (result?.files ?? []).filter(doc => doc.indexStatus === 'ready' && !excluded.includes(doc.id)).map(doc => doc.id)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<CollectionDocument | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const loading = version !== result?.version
  const refresh = () => setVersion(old => old + 1)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getCollection(id, controller.signal), listDocuments(id, controller.signal)])
      .then(([collection, files]) => {
        if (!controller.signal.aborted) setResult({ version, collection, files })
      }).catch(cause => {
        if (!controller.signal.aborted) setResult({ version, error: errorMessage(cause) })
      })
    return () => controller.abort()
  }, [id, version])

  useEffect(() => {
    if (loading || !result?.files?.some(doc => ['pending', 'indexing'].includes(doc.indexStatus))) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const files = await listDocuments(id, controller.signal)
        if (!controller.signal.aborted) setResult({ version, collection: result.collection, files })
      } catch (cause) {
        if (!controller.signal.aborted) setResult({ ...result, error: errorMessage(cause) })
      }
    }, 2000)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [id, result, loading, version])

  async function perform(action: string, operation: () => Promise<unknown>) {
    if (busy.current) return
    busy.current = true
    setPending(action)
    setError('')
    try {
      await operation()
      if (action !== 'download') refresh()
      setConfirm(null)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      busy.current = false
      setPending('')
    }
  }

  return <WorkspaceLayout detail title={result?.collection?.name ?? 'Collection'} action={
    <Button aria-label="Upload PDF" variant="outlined" startIcon={<WorkspaceIcon name="plus" />} disabled={!!pending || loading || !result?.collection} onClick={() => input.current?.click()}>
      {pending === 'upload' ? 'Uploading…' : 'Upload documents'}
    </Button>
  }>
    <input hidden ref={input} type="file" accept="application/pdf,.pdf" aria-label="Choose PDF" onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) {
        if (mobile) setDocumentsOpen(true)
        void perform('upload', () => uploadPdf(id, file))
      }
    }} />
    {result?.collection?.description && <p className="collection-description">{result.collection.description}</p>}
    <div className="collection-detail-columns">
      {mobile && <Button className="panel-trigger documents-trigger" variant="outlined"
        aria-haspopup="dialog" aria-expanded={documentsOpen} onClick={() => setDocumentsOpen(true)}>
        Documents <span>{selected.length} selected</span>
      </Button>}
      <ReadingPanel title="Documents" mobile={mobile} open={documentsOpen} onClose={() => setDocumentsOpen(false)}>
        <section aria-label="Documents" aria-busy={loading || pending === 'upload'}>
          <header className="document-heading">{!mobile && <div className="panel-heading"><h2>Documents</h2>
            {result?.files && <span className="panel-count" aria-label={selected.length + ' documents selected'}>{selected.length} selected</span>}
          </div>}<p>Answers draw only from checked files.</p></header>
          {loading && <LinearProgress aria-label="Loading documents" />}
          {pending === 'upload' && <LinearProgress aria-label="Uploading PDF" />}
          {!loading && result?.error && <Alert severity="error" action={<Button onClick={refresh}>Retry</Button>}>{result.error}</Alert>}
          {error && !confirm && <Alert severity="error">{error}</Alert>}
          {result?.files?.length === 0 && !loading && <div className="collections-empty"><h2>No PDFs yet</h2>
            <p>Upload a PDF to this collection.</p></div>}
          {!!result?.files?.length && <ul className="document-list">{result.files.map(doc => <li key={doc.id}>
            <label className="document-choice">
              <Checkbox size="small" disabled={doc.indexStatus !== 'ready'} checked={selected.includes(doc.id)}
                onChange={e => setExcluded(old => e.target.checked ? old.filter(x => x !== doc.id) : [...old, doc.id])} />
              <WorkspaceIcon name="file" /><strong>{doc.originalFilename}</strong><Status value={doc.indexStatus} compact />
            </label>
            {doc.indexError && <p className="index-error">{doc.indexError}</p>}
            <div className="doc-actions"><time dateTime={doc.uploadedAt}>Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}</time>
              {doc.indexStatus === 'failed' && <Button size="small" disabled={!!pending} onClick={() => void perform('index', () => indexDocument(id, doc.id))}>Retry indexing</Button>}
              <Button size="small" aria-label={'Download ' + doc.originalFilename} disabled={!!pending}
                onClick={() => void perform('download', () => downloadPdf(id, doc))}>Download</Button>
              <IconButton size="small" aria-label={'Delete ' + doc.originalFilename} disabled={!!pending}
                onClick={() => { setError(''); setConfirm(doc) }}><WorkspaceIcon name="trash" /></IconButton>
            </div>
          </li>)}</ul>}
        </section>
      </ReadingPanel>
      <ChatPanel mobile={mobile} id={id} selected={selected} files={(result?.files ?? []).map(doc => doc.id)} saved={result?.collection?.latestChat} />
    </div>
    {confirm && <Dialog open fullWidth maxWidth="xs" aria-labelledby="delete-document-title"
      onClose={() => { if (!busy.current) { setConfirm(null); setError('') } }}>
      <DialogTitle id="delete-document-title">Delete PDF?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ overflowWrap: 'anywhere' }}>Delete <strong>{confirm.originalFilename}</strong> from this collection?</DialogContentText>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button autoFocus disabled={!!pending} onClick={() => { setConfirm(null); setError('') }}>Cancel</Button>
        <Button variant="contained" color="error" loading={pending === 'delete'} disabled={!!pending}
          onClick={() => void perform('delete', () => deleteDocument(id, confirm.id))}>Delete PDF</Button>
      </DialogActions>
    </Dialog>}
  </WorkspaceLayout>
}

export function CollectionDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  return user && id && <Documents key={user.id + '/' + id} id={id} />
}
