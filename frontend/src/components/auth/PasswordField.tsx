import { useState } from 'react'
import { IconButton, InputAdornment, SvgIcon, TextField } from '@mui/material'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  autoComplete: 'current-password' | 'new-password'
}

export function PasswordField({ id, label, value, onChange, error, autoComplete }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField id={id} name={id} label={label} type={visible ? 'text' : 'password'} value={value}
      onChange={(event) => onChange(event.target.value)} required autoComplete={autoComplete}
      error={Boolean(error)} helperText={error}
      slotProps={{ input: { endAdornment: (
        <InputAdornment position="end">
          <IconButton aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}
            onClick={() => setVisible(!visible)} onMouseDown={(event) => event.preventDefault()} edge="end">
            <SvgIcon><path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Zm0 12c-3.6 0-6.8-3-7.8-5C5.2 10 8.4 7 12 7s6.8 3 7.8 5c-1 2-4.2 5-7.8 5Zm0-9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />{visible && <path d="m3 2 19 19-1.4 1.4-19-19Z" />}</SvgIcon>
          </IconButton>
        </InputAdornment>
      ) } }} />
  )
}
