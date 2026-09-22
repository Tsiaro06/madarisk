import { Navigate } from 'react-router-dom';

/** @deprecated Regroupé dans /profil */
export function PasswordPage() {
  return <Navigate to="/profil" replace />;
}
