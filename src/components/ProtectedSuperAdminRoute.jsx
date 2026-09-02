import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

function ProtectedSuperAdminRoute() {
  const { isAuthenticated, isLoading, isSuperAdmin } = useAuth()

  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  if (!isSuperAdmin) {
    return <Navigate replace to="/app" />
  }

  return <Outlet />
}

export default ProtectedSuperAdminRoute
