import { forwardRef, type ReactNode } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Fade, Slide, type SlideProps, useMediaQuery } from '@mui/material'

type Props = {
  title: string
  titleDetail?: ReactNode
  mobile: boolean
  open: boolean
  onClose: () => void
  onEntered?: () => void
  children: ReactNode
}

const SheetSlide = forwardRef<unknown, SlideProps>(function SheetSlide(props, ref) {
  return <Slide {...props} ref={ref} direction="up" />
})

export function ReadingPanel({ title, titleDetail, mobile, open, onClose, onEntered, children }: Props) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  if (!mobile) return children
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-label={title}
    className="reading-dialog" slots={{ transition: reducedMotion ? Fade : SheetSlide }}
    transitionDuration={reducedMotion ? 0 : { enter: 210, exit: 150 }} slotProps={{ transition: { onEntered } }}>
    <DialogTitle className={titleDetail ? 'panel-heading' : undefined}>{title}{titleDetail}</DialogTitle>
    <DialogContent dividers>{children}</DialogContent>
    <DialogActions><Button onClick={onClose}>Done</Button></DialogActions>
  </Dialog>
}
