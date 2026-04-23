import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
  requireRoles?: AppRole[];
}

export const ProtectedRoute = ({ children, requireRoles }: Props) => {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;

  if (requireRoles && requireRoles.length > 0 && !hasRole(...requireRoles)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  return <>{children}</>;
};
