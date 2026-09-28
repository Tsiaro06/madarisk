import { useIsFetching } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface RefreshDataButtonProps {
  onRefresh: () => void;
  queryKey?: unknown[];
  label?: string;
  className?: string;
}

export function RefreshDataButton({
  onRefresh,
  queryKey,
  label = 'Actualiser les données',
  className,
}: RefreshDataButtonProps) {
  const fetchingCount = useIsFetching(
    queryKey ? { queryKey } : undefined,
  );
  const refreshing = fetchingCount > 0;

  return (
    <Button variant="outline" onClick={onRefresh} className={className}>
      <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
      {label}
    </Button>
  );
}