import { SvgIcon } from '@mui/material'

const paths = {
  book: 'M3 4.8c3.5-1.4 6.4-.9 9 1.2 2.6-2.1 5.5-2.6 9-1.2v14c-3.5-1.4-6.4-.9-9 1.2-2.6-2.1-5.5-2.6-9-1.2z M12 6v14',
  folder: 'M3 7V5.5C3 4.7 3.7 4 4.5 4H9l2.4 3h8.1c.8 0 1.5.7 1.5 1.5v10c0 .8-.7 1.5-1.5 1.5h-15c-.8 0-1.5-.7-1.5-1.5z',
  plus: 'M12 5v14 M5 12h14',
  edit: 'm4 16-.8 4.8 4.8-.8L20 8l-4-4z M13 7l4 4',
  trash: 'M4 6h16 M9 6V3.8h6V6 M6.5 6l1 14h9l1-14 M10 10v6 M14 10v6',
  next: 'm9 5 7 7-7 7',
  previous: 'm15 5-7 7 7 7',
}
export function WorkspaceIcon({ name }: { name: keyof typeof paths }) {
  return <SvgIcon aria-hidden="true" fontSize="inherit" viewBox="0 0 24 24">
    <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </SvgIcon>
}
