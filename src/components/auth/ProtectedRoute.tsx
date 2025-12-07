import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
  skipOnboardingCheck?: boolean;
}

export function ProtectedRoute({ children, requiredRole, skipOnboardingCheck }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Wait for profile to load before checking clinic
  // This prevents access to protected routes before we know if user has a clinic
  if (!skipOnboardingCheck && profile === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Check if user needs onboarding (no clinic assigned)
  if (!skipOnboardingCheck && profile && !profile.clinic_id) {
    return <Navigate to="/onboarding" replace />;
  }

  // Check role if required
  if (requiredRole && profile) {
    const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    if (!allowedRoles.includes(profile.role)) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <>{children}</>;
}

export default ProtectedRoute;