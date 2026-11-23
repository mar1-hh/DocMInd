import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { theme } from './theme/theme'
import { PdfPage } from './pages/PdfPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { CollectionDetailPage } from './pages/CollectionDetailPage'
import { ChatSession } from './components/chat/ChatSession'
import { CollectionsPage } from './pages/CollectionsPage'
import { AuthBootstrap, ProtectedRoute, PublicRoute } from './auth/AuthRoutes'

function App() {
  return (
    <ThemeProvider theme={theme} defaultMode="light" modeStorageKey="docmind-color-mode" noSsr>
      <CssBaseline />
      <BrowserRouter>
        <AuthBootstrap>
          <Routes>
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/collections" replace />} />
              <Route element={<ChatSession />}>
                <Route path="/recent-chats" element={<CollectionsPage recentChats />} />
                <Route path="/collections/:id/documents/:documentId/view" element={<PdfPage />} />
                <Route path="/collections" element={<CollectionsPage />} />
                <Route path="/collections/:id" element={<CollectionDetailPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/collections" replace />} />
          </Routes>
        </AuthBootstrap>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
