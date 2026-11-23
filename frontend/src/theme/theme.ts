import { createTheme } from '@mui/material/styles'

const yellow = { main: '#ffe047', light: '#ffed94', dark: '#e6c322', contrastText: '#000' }
const white = { main: '#fff', light: '#fff', dark: '#ccc', contrastText: '#000' }

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: {
      primary: { main: '#3235e6', dark: '#2224b9', contrastText: '#fff' },
      background: { default: '#edeef2', paper: '#fff' },
      text: { primary: '#171923', secondary: '#565e70' },
      divider: '#cdd1dc',
    } },
    dark: { palette: {
      primary: yellow, secondary: white,
      error: yellow, warning: yellow, info: white, success: white,
      background: { default: '#000', paper: '#141414' },
      text: { primary: '#fff', secondary: '#c2c2c2' },
      divider: '#444',
    } },
  },
  typography: {
    fontFamily: '"DM Sans Variable", Arial, Helvetica, sans-serif',
    h1: { fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.07rem' },
    h2: { fontSize: '2.15rem', fontWeight: 700, lineHeight: 1.18 },
    button: { textTransform: 'none', fontSize: '1rem', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiDialog: { defaultProps: { transitionDuration: { enter: 150, exit: 100 } }, styleOverrides: {
      paper: { border: '1px solid var(--mui-palette-divider)', borderRadius: 14, backgroundImage: 'none' },
    } },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, letterSpacing: '-.035em' } } },
    MuiDialogActions: { styleOverrides: { root: {
      padding: '14px 24px', gap: 6, borderTop: '1px solid var(--mui-palette-divider)',
      backgroundColor: 'color-mix(in srgb, var(--mui-palette-background-default) 42%, var(--mui-palette-background-paper))',
      '& .MuiButton-root': { minHeight: 44, paddingInline: 16 },
    } } },
    MuiButtonBase: { styleOverrides: {
      root: { '&.Mui-focusVisible': { outline: '3px solid var(--mui-palette-primary-main)', outlineOffset: 2 } },
    } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 54 } } },
    MuiTextField: { defaultProps: { fullWidth: true, variant: 'outlined' } },
    MuiOutlinedInput: { styleOverrides: {
      root: { backgroundColor: 'var(--mui-palette-background-paper)', '& fieldset': { borderColor: 'var(--mui-palette-divider)' } },
      input: { padding: '18px 16px' },
    } },
    MuiLink: { defaultProps: { underline: 'hover' }, styleOverrides: { root: { fontWeight: 600 } } },
  },
})
