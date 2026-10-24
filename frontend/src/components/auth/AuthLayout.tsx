import type { ReactNode } from 'react'
import { Box, Paper, Typography } from '@mui/material'
import { DocumentArtwork } from './DocumentArtwork'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: { xs: 2, sm: 4, md: 6 } }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 1040, minHeight: { md: 650 }, overflow: 'hidden', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '45% 55%' }, borderRadius: 2, boxShadow: '0 16px 48px #142c4b12' }}>
        <Box component="aside" sx={{ bgcolor: '#142843', color: 'white', p: { xs: 3, sm: 4, md: 5 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box component="svg" viewBox="0 0 48 56" fill="none" aria-hidden="true" sx={{ width: 44, height: 52 }}>
              <path d="M31 3H10a6 6 0 0 0-6 6v38a6 6 0 0 0 6 6h28a6 6 0 0 0 6-6V17L31 3Z" stroke="#dceaff" strokeWidth="4" />
              <path d="M31 3v15h13M15 23h12M15 33h19M15 43h12" stroke="#4395ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </Box>
            <Typography component="div" sx={{ fontSize: { xs: 30, md: 37 }, fontWeight: 700, letterSpacing: '-1px' }}>Doc<Box component="span" sx={{ color: '#4c98ff' }}>Mind</Box></Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', md: 'block' }, my: 3 }}><DocumentArtwork /></Box>
          <Typography variant="h2" component="p" sx={{ display: { xs: 'none', md: 'block' } }}>Your documents.<br />Clear answers.</Typography>
          <Typography sx={{ display: { xs: 'none', md: 'block' }, color: '#aec2df', fontSize: 19, mt: 2, maxWidth: 310 }}>Organize your knowledge and find answers faster.</Typography>
        </Box>
        <Box sx={{ p: { xs: 3, sm: 5, md: 6 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>{children}</Box>
      </Paper>
    </Box>
  )
}
