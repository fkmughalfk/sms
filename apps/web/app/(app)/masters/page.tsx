'use client';

import { Building2, Landmark, MapPin, Package, Tags, UserRound, Users } from 'lucide-react';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';

const MASTERS = [
  {
    href: 'products',
    title: 'Products',
    icon: Package,
    text: 'Product #, weight, pack, category, commission override.',
  },
  {
    href: 'categories',
    title: 'Categories',
    icon: Tags,
    text: 'Rice, Pulses, Other — and their commission rates.',
  },
  {
    href: 'parties',
    title: 'Parties',
    icon: Building2,
    text: 'Customers: default city, phone, opening balance.',
  },
  {
    href: 'sub-parties',
    title: 'Sub-parties',
    icon: Users,
    text: 'Branches / sub-accounts, optionally under a party.',
  },
  { href: 'cities', title: 'Cities', icon: MapPin, text: 'Cities used on parties and invoices.' },
  {
    href: 'salespersons',
    title: 'Salespersons (ASM)',
    icon: UserRound,
    text: 'Area sales managers on invoices.',
  },
  {
    href: 'banks',
    title: 'Banks',
    icon: Landmark,
    text: 'Banks (and Cash) for recording payments.',
  },
];

export default function MastersPage() {
  const { can } = useAuth();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold">Masters</h1>
        <p className="text-sm text-muted-foreground">
          {can('masters.manage')
            ? 'Lists used across invoices and payments.'
            : 'Lists used across invoices and payments (read-only for your role).'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MASTERS.map(({ href, title, icon: Icon, text }) => (
          <Link
            key={href}
            href={`/masters/${href}`}
            className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4" /> {title}
                </CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
