import type { Metadata } from 'next';
import { Wheat } from 'lucide-react';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in · SMS' };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 px-4">
      {/* Soft colour blobs behind the card. */}
      <div
        aria-hidden
        className="absolute -top-32 -left-32 size-96 rounded-full bg-fuchsia-500/30 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -right-24 -bottom-32 size-96 rounded-full bg-amber-400/25 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 grid justify-items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-indigo-950 shadow-lg">
            <Wheat className="size-7" />
          </span>
          <div>
            <p className="text-sm text-indigo-200">Waqar Rice Mills</p>
            <h1 className="text-2xl font-bold text-white">Sales Management System</h1>
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
