import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge/píldora. Las variantes semánticas (verde/ámbar/rojo) usan los tintes
 * del semáforo del design system: nunca el color solo, siempre con texto.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-tav-line text-tav-ink-2',
        verde: 'border-transparent bg-tav-green-50 text-tav-green-600',
        ambar: 'border-transparent bg-tav-gold-50 text-tav-gold-700',
        rojo: 'border-transparent bg-tav-red-50 text-tav-red-700',
        navy: 'border-transparent bg-tav-navy text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
