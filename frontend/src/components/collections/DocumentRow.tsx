import { useState } from 'react'
import { IconButton, ListSubheader, Menu, MenuItem, Tooltip } from '@mui/material'
import type { CollectionDocument } from '../../api/documents'
import { Status } from './Status'

type Props = {
  doc: CollectionDocument
  selected: boolean
  busy: boolean
  onSelect: (checked: boolean) => void
  onDownload: () => void
  onDelete: () => void
  onRetry: () => void
}

export function DocumentRow({ doc, selected, busy, onSelect, onDownload, onDelete, onRetry }: Props) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const name = doc.originalFilename
  const title = name.replace(/\.pdf$/i, '') || name
  const ready = doc.indexStatus === 'ready'
  const menuId = 'document-actions-' + doc.id

  function run(action: () => void) {
    setAnchor(null)
    action()
  }

  return <li>
    <div className="document-row">
      <Tooltip title={name} describeChild placement="top-start">
        <button className="document-choice" type="button" role="checkbox" aria-label={name}
          aria-checked={selected} disabled={!ready} onClick={() => onSelect(!selected)}>
          <span className="document-basename">{title}</span>
        </button>
      </Tooltip>
      <Tooltip title={name} describeChild>
        <IconButton aria-label={'Actions for ' + name} aria-haspopup="menu" aria-controls={anchor ? menuId : undefined}
          aria-expanded={!!anchor} disabled={busy} onClick={event => setAnchor(event.currentTarget)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <circle cx="3" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="17" cy="10" r="1.5" />
          </svg>
        </IconButton>
      </Tooltip>
    </div>
    {!ready && <div className="document-index-state"><Status value={doc.indexStatus} />
      {doc.indexError && <p>{doc.indexError}</p>}
    </div>}
    <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}
      slotProps={{ list: { id: menuId, 'aria-label': 'Actions for ' + name } }}>
      <ListSubheader>Uploaded <time dateTime={doc.uploadedAt}>{new Date(doc.uploadedAt).toLocaleDateString()}</time></ListSubheader>
      <MenuItem onClick={() => run(onDownload)}>Download</MenuItem>
      {doc.indexStatus === 'failed' && <MenuItem onClick={() => run(onRetry)}>Retry indexing</MenuItem>}
      <MenuItem onClick={() => run(onDelete)}>Delete</MenuItem>
    </Menu>
  </li>
}
