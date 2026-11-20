import { useRef, useState } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material'
import { ApiError, errorMessage } from '../../api/auth'
import { collectionInput, deleteCollection, saveCollection, type Collection } from '../../api/collections'

export type Action = { kind: 'create' } | { kind: 'edit' | 'delete'; collection: Collection }

export function CollectionDialog({ action, onClose, onSaved }: {
  action: Action; onClose: () => void; onSaved: () => void
}) {
  const item = action.kind === 'create' ? undefined : action.collection
  const deleting = action.kind === 'delete'
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const descriptionInput = useRef<HTMLTextAreaElement>(null)

  const cancelButton = useRef<HTMLButtonElement>(null)
  function focusInitialControl() {
    const control = deleting ? cancelButton.current : nameInput.current
    const dialog = control?.closest('[role="dialog"]')
    // The modal's focus trap may take focus while its entrance transition runs.
    if (control && (dialog === document.activeElement || !dialog?.contains(document.activeElement))) control.focus()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy.current) return
    const parsed = collectionInput.safeParse({ name, description })
    if (!deleting && !parsed.success) {
      const messages: Record<string, string> = {}
      for (const issue of parsed.error.issues) messages[String(issue.path[0])] = issue.message
      setFields(messages)
      if (messages.name) nameInput.current?.focus()
      else descriptionInput.current?.focus()
      return
    }
    busy.current = true
    setPending(true)
    setError('')
    setFields({})
    try {
      if (action.kind === 'delete') await deleteCollection(action.collection.id)
      else if (parsed.success) await saveCollection(parsed.data, item?.id)
      onSaved()
    } catch (cause) {
      setError(errorMessage(cause))
      if (cause instanceof ApiError) setFields(cause.fieldErrors)
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return <Dialog open fullWidth maxWidth="xs" aria-labelledby="collection-dialog-title"
    slotProps={{ transition: { onEntered: focusInitialControl } }}
    aria-describedby={deleting ? 'delete-explanation' : undefined} onClose={() => { if (!busy.current) onClose() }}>
    <form noValidate onSubmit={submit}>
      <DialogTitle id="collection-dialog-title">{deleting ? 'Delete collection?' : item ? 'Edit collection' : 'New collection'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {deleting ? <DialogContentText id="delete-explanation" sx={{ overflowWrap: 'anywhere' }}>
            Delete <strong>{item?.name}</strong>? This action cannot be undone.
          </DialogContentText> : <>
            <TextField id="collection-name" autoFocus required label="Name" value={name} inputRef={nameInput} disabled={pending}
              onChange={event => setName(event.target.value)} error={!!fields.name} helperText={fields.name} />
            <TextField id="collection-description" multiline minRows={3} label="Description (optional)" value={description}
              inputRef={descriptionInput} disabled={pending} onChange={event => setDescription(event.target.value)}
              error={!!fields.description} helperText={fields.description ?? `${description.length}/500`} />
          </>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button ref={cancelButton} autoFocus={deleting} disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" color={deleting ? 'error' : 'primary'} disabled={pending}>
          {deleting ? 'Delete collection' : item ? 'Save changes' : 'Create collection'}
        </Button>
      </DialogActions>
    </form>
  </Dialog>
}
