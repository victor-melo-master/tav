import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-tav-line-2', className)} {...props} />;
}

export { Skeleton };
