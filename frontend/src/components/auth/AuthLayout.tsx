import type { ReactNode } from 'react'
import { Wordmark } from '../Wordmark'

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-page">
    <header className="topbar"><Wordmark /></header>
    <main className="auth-main"><section className="auth-sheet">{children}</section></main>
  </div>
}
