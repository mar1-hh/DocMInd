import { AuthForm } from '../components/auth/AuthForm'
import { AuthLayout } from '../components/auth/AuthLayout'

export function LoginPage() {
  return <AuthLayout><AuthForm mode="login" /></AuthLayout>
}
