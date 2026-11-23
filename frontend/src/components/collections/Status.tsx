const labels: Record<string, string> = { pending: 'Pending', indexing: 'Processing', processing: 'Processing', ready: 'Ready', failed: 'Failed', empty: 'Empty' }
export function Status({ value, compact = false }: { value: string; compact?: boolean }) {
  return <span className={'status status-' + value + (compact ? ' compact' : '')} title={labels[value]}>
    <i aria-hidden="true" /><span>{labels[value]}</span>
  </span>
}
export function Timestamp({ value }: { value: string }) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const day = date.toDateString() === today.toDateString() ? 'Today' : date.toDateString() === yesterday.toDateString()
    ? 'Yesterday' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return <time dateTime={value}>{day}, {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
}
