import { useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { errorMessage } from '../../api/auth'
import { askCollection, type Reply } from '../../api/chat'
import { useAuth } from '../../auth/useAuth'

type Turn = { question: string; reply?: Reply; error?: string }
export type ChatContext = {
  history: Record<string, Turn[]>
  ask: (collectionId: string, question: string, documentIds: string[]) => Promise<void>
}

function Session() {
  const [history, setHistory] = useState<ChatContext['history']>({})
  const pending = useRef(new Set<string>())

  async function ask(id: string, question: string, documentIds: string[]) {
    if (pending.current.has(id)) return
    pending.current.add(id)
    const turn: Turn = { question }
    setHistory(prev => ({ ...prev, [id]: [...(prev[id] ?? []), turn] }))
    let completion: Partial<Turn>
    try {
      completion = { reply: await askCollection(id, question, documentIds) }
    } catch (cause) {
      completion = { error: errorMessage(cause) }
    } finally {
      pending.current.delete(id)
    }
    setHistory(prev => ({ ...prev, [id]: prev[id].map(item => item === turn ? { ...turn, ...completion } : item) }))
  }
  return <Outlet context={{ history, ask } satisfies ChatContext} />
}

export function ChatSession() {
  const { user } = useAuth()
  return user && <Session key={user.id} />
}
