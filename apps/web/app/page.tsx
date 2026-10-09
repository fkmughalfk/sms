import { HealthStatus } from '@/components/health-status';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-16">
      <div>
        <p className="text-sm text-muted-foreground">Waqar Rice Mills</p>
        <h1 className="text-2xl font-semibold">Sales Management System</h1>
      </div>
      <HealthStatus />
    </main>
  );
}
