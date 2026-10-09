'use client';

import { healthResponseSchema } from '@sms/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function HealthStatus() {
  const { data, error, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health', healthResponseSchema),
  });

  const label = isPending ? 'Checking API…' : error ? 'API unreachable' : 'API online';

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-4">
      <span
        aria-hidden
        className={cn(
          'size-2.5 rounded-full',
          isPending ? 'bg-muted-foreground' : error ? 'bg-destructive' : 'bg-success',
        )}
      />
      <div className="text-sm">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">
          {error ? error.message : data ? `Last check ${data.timestamp}` : 'GET /api/v1/health'}
        </p>
      </div>
    </div>
  );
}
