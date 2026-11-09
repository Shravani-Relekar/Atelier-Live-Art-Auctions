import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/api";

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-ink-muted">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

export function ErrorState({ error, title = "Something went wrong" }: { error: unknown; title?: string }) {
  const msg = error instanceof ApiError ? error.message : "Please check your connection and try again.";
  return (
    <div className="container-x py-24 text-center">
      <h2 className="text-3xl">{error instanceof ApiError && error.status === 404 ? "Not found" : title}</h2>
      <p className="mt-2 text-ink-muted">{msg}</p>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-ink/15 px-6 py-16 text-center">
      <h3 className="text-2xl">{title}</h3>
      {body && <p className="mt-2 text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-4xl md:text-5xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}
