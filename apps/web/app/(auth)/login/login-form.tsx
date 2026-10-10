'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { authUserSchema, type LoginInput, loginSchema } from '@sms/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { ME_QUERY_KEY } from '@/lib/auth';

/** Only same-site relative paths, so ?next= can't redirect off-site. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await api.post('/auth/login', authUserSchema, values);
      queryClient.setQueryData(ME_QUERY_KEY, user);
      router.replace(safeNext(params.get('next')));
    } catch (e) {
      setError(
        e instanceof ApiError && e.statusCode === 429
          ? 'Too many attempts. Wait a minute and try again.'
          : e instanceof ApiError
            ? e.message
            : 'Could not reach the server.',
      );
    }
  });

  return (
    <Card className="border-white/20 shadow-2xl shadow-indigo-950/40">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              {...form.register('email')}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
