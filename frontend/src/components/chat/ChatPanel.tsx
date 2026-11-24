import { useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Alert, Button } from '@mui/material'
import type { Collection } from '../../api/collections'
import { WorkspaceIcon } from '../collections/WorkspaceIcon'
import { ReadingPanel } from './ReadingPanel'
import type { ChatContext } from './ChatSession'

// Emphasize a phrase actually shared with the cited passage, while leaving paraphrases readable.
function SharedPhrase({ text, passages }: { text: string; passages: string[] }) {
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)]
  const sources = passages.map(p => p.toLocaleLowerCase())
  for (let size = Math.min(9, words.length); size >= 2; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const start = words[i].index
      const last = words[i + size - 1]
      const end = last.index + last[0].length
      const phrase = text.slice(start, end)
      if (phrase.length >= 10 && sources.some(s => s.includes(phrase.toLocaleLowerCase()))) {
        return <>{text.slice(0, start)}<mark>{phrase}</mark>{text.slice(end)}</>
      }
    }
  }
  return <>{text}</>
}

function Excerpt({ text, highlight }: { text: string; highlight: string }) {
  const start = highlight ? text.indexOf(highlight) : -1
  return <blockquote>{start < 0 ? text : <>{text.slice(0, start)}<mark>{highlight}</mark>{text.slice(start + highlight.length)}</>}</blockquote>
}

export function ChatPanel({ id, selected, files, saved, mobile }: { mobile: boolean; id: string; selected: string[]; files: string[]; saved?: Collection['latestChat'] }) {
  const { history, ask } = useOutletContext<ChatContext>()
  const [question, setQuestion] = useState('')
  const [active, setActive] = useState<{ turn: number; citation: number } | null>(null)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const requestedCitation = useRef<number | null>(null)
  const citationButton = useRef<HTMLButtonElement | null>(null)
  const turns = history[id] ?? []
  const conversation = saved?.reply && !turns.some(t => t.question === saved.question)
    ? [{ question: saved.question, reply: saved.reply, error: undefined }, ...turns] : turns
  const last = conversation.at(-1)
  const pending = !!last && !last.reply && !last.error
  const enabled = selected.length > 0 && !pending
  const evidence = active === null ? last?.reply : conversation[active.turn]?.reply
  function submit(text: string) {
    if (!enabled || !text.trim()) return
    setActive(null)
    void ask(id, text.trim(), selected)
    setQuestion('')
  }
  function showEvidence(turn: number, citation: number, button: HTMLButtonElement) {
    citationButton.current = button
    setActive({ turn, citation })
    if (mobile) {
      requestedCitation.current = citation
      setEvidenceOpen(true)
    } else {
      requestAnimationFrame(() => document.getElementById('evidence-' + citation)?.focus())
    }
  }
  function returnToAnswer() {
    if (mobile) setEvidenceOpen(false)
    else citationButton.current?.focus()
  }
  return <>
    {mobile && <Button className="panel-trigger evidence-trigger" variant="outlined"
      aria-haspopup="dialog" aria-expanded={evidenceOpen} onClick={() => { requestedCitation.current = null; setEvidenceOpen(true) }}>
      Evidence <span>{evidence?.sources.length ?? 0} {evidence?.sources.length === 1 ? 'source' : 'sources'}</span>
    </Button>}
    <section className="conversation" aria-label="Collection chat">
      <div className="turns" role="log" aria-label="Conversation" aria-live="polite">
        {conversation.map((turn, idx) => <div className="turn" key={idx}>
          <div className="question-bubble">{turn.question}</div>
          {turn.reply ? <div className="answer">{turn.reply.statements.map((statement, n) => <p key={n}>
            {statement.citations.length ? <SharedPhrase text={statement.text} passages={statement.citations.map(c => turn.reply!.sources[c - 1].snippet)} /> : statement.text}
            {statement.citations.map(c => <sup key={c}><button aria-label={'Show evidence ' + c} aria-current={active?.turn === idx && active.citation === c ? 'true' : undefined}
              onClick={e => showEvidence(idx, c, e.currentTarget)}>[{c}]</button></sup>)}
          </p>)}</div> : turn.error ? <Alert severity="error" action={<Button disabled={!enabled} onClick={() => submit(turn.question)}>Retry</Button>}>{turn.error}</Alert>
            : <p role="status">Finding an answer…</p>}
        </div>)}
      </div>
      {!last && <div className="chat-empty"><h2>Ask about this collection</h2><p>{selected.length ? 'Your answer will include references to the selected PDFs.' : 'Select a ready PDF to ask a question.'}</p></div>}
      {last?.reply && <div className="followups">
        <Button variant="outlined" disabled={!enabled} onClick={() => submit(('Explain in simpler terms: ' + last.question).slice(0, 2000))}>Explain in simpler terms</Button>
        <Button variant="outlined" disabled={!enabled} onClick={() => submit(('What details in the sources support the answer to: ' + last.question).slice(0, 2000))}>Explore the evidence</Button>
      </div>}
      <form className="composer" onSubmit={e => { e.preventDefault(); submit(question) }}>
        <input required aria-label="Question" maxLength={2000} placeholder="Ask about these documents" value={question}
          onChange={e => setQuestion(e.target.value)} />
        <Button type="submit" variant="contained" aria-label="Ask question" loading={pending} disabled={!enabled}>Ask</Button>
      </form>
    </section>
    <ReadingPanel title="Evidence for this answer" mobile={mobile} open={evidenceOpen} onClose={() => setEvidenceOpen(false)}
      onEntered={() => {
        if (requestedCitation.current !== null) document.getElementById('evidence-' + requestedCitation.current)?.focus()
      }}>
      <aside className="evidence-panel" aria-label="Evidence" onKeyDown={event => {
        if (!mobile && event.key === 'Escape' && citationButton.current?.isConnected) returnToAnswer()
      }}>
        {!mobile && <header className="panel-heading"><h2>Evidence for this answer</h2>
          {!!evidence?.sources.length && <span className="panel-count" aria-label={evidence.sources.length + ' sources'}>{evidence.sources.length}</span>}
        </header>}<p>Passages the answer is based on.</p>
        {evidence?.sources.length ? <ol aria-label="Sources">{evidence.sources.map((source, index) => <li
          data-current={active?.citation === index + 1 || undefined} tabIndex={-1} id={'evidence-' + (index + 1)} key={index}>
          <header><strong>{source.filename}</strong><b>[{index + 1}] Page {source.page}</b></header>
          <Excerpt text={source.snippet} highlight={source.highlight} />
          {files.includes(source.documentId)
            ? <Link target="_blank" rel="noopener" to={`/collections/${id}/documents/${source.documentId}/view?page=${source.page}`}>Open page {source.page}</Link>
            : <span className="source-unavailable">PDF unavailable</span>}
          {!mobile && active?.citation === index + 1 && <button type="button" className="return-citation" onClick={returnToAnswer}>
            <WorkspaceIcon name="previous" /> Back to answer
          </button>}
        </li>)}</ol> : <p className="evidence-empty">{evidence ? 'No supporting passage found.' : 'Cited passages will appear here.'}</p>}
      </aside>
    </ReadingPanel>
  </>
}
