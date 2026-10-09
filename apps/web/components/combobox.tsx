'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra text shown dimmed and matched by search (e.g. product #). */
  hint?: string;
}

/** Searchable single-select (spec §5.2 "searchable combobox"). */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  noneLabel,
  disabled,
  className,
}: {
  id?: string;
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** When set, a first option that clears the value. */
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const pick = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {noneLabel && (
                <CommandItem value="__none__" onSelect={() => pick(null)}>
                  <Check className={cn(value ? 'opacity-0' : 'opacity-100')} />
                  <span className="text-muted-foreground">{noneLabel}</span>
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ''} ${o.value}`}
                  onSelect={() => pick(o.value)}
                >
                  <Check className={cn(o.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
