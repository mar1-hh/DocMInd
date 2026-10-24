import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: { main: '#287eff', dark: '#1664d8' },
    background: { default: '#e9edf3', paper: '#ffffff' },
    text: { primary: '#0b1020', secondary: '#5d7093' },
    divider: '#dce3ed',
  },
  typography: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    h1: { fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.07rem' },
    h2: { fontSize: '2.15rem', fontWeight: 700, lineHeight: 1.18 },
    button: { textTransform: 'none', fontSize: '1rem', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 54 } } },
    MuiTextField: { defaultProps: { fullWidth: true, variant: 'outlined' } },
    MuiOutlinedInput: { styleOverrides: {
      root: { backgroundColor: '#fff', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#b9c6db' } },
      input: { padding: '18px 16px' },
    } },
    MuiLink: { defaultProps: { underline: 'hover' }, styleOverrides: { root: { fontWeight: 600 } } },
  },
})
