import { AuthForm } from '../components/auth/AuthForm'
import { AuthLayout } from '../components/auth/AuthLayout'

export function RegisterPage() {
  return <AuthLayout><AuthForm mode="register" /></AuthLayout>
}
