'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PaymentForm } from './payment-form';

/**
 * "Receive payment" from Recovery or a party ledger without leaving the page
 * (Phase 1 quick wins). The party is pre-selected; lists refresh after saving.
 */
export function ReceivePaymentDialog({
  party,
  onOpenChange,
}: {
  party: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!party} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Receive payment</DialogTitle>
          <DialogDescription>{party?.name}</DialogDescription>
        </DialogHeader>
        {party && (
          <PaymentForm key={party.id} partyId={party.id} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
