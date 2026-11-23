import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Alert, CircularProgress } from '@mui/material'
import { fetchPdf } from '../api/documents'
import { errorMessage } from '../api/auth'

export function PdfPage() {
  const { id, documentId } = useParams()
  const [query] = useSearchParams()
  const page = Math.max(1, Number.parseInt(query.get('page') ?? '1', 10) || 1)
  const [file, setFile] = useState<{ url?: string; error?: string }>()
  useEffect(() => {
    const controller = new AbortController()
    let url: string | undefined
    fetchPdf(id!, documentId!, controller.signal).then(blob => {
      if (!controller.signal.aborted) {
        url = URL.createObjectURL(blob)
        setFile({ url })
      }
    }).catch(cause => { if (!controller.signal.aborted) setFile({ error: errorMessage(cause) }) })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [id, documentId])
  return <main className="pdf-view"><Link to={'/collections/' + id}>Back to collection</Link>
    {file?.error ? <Alert severity="error">{file.error}</Alert> : file?.url
      ? <iframe title={'PDF at page ' + page} src={file.url + '#page=' + page} /> : <CircularProgress aria-label="Loading PDF" />}
  </main>
}
