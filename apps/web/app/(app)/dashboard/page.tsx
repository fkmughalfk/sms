'use client';

import { HealthStatus } from '@/components/health-status';
import { useAuth } from '@/lib/auth';

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome, {user.name}. KPIs, targets and sales breakdowns arrive in phase 6.
        </p>
      </div>
      <HealthStatus />
    </div>
  );
}
