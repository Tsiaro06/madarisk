import { Badge } from '@/components/ui/Badge';

interface SimulatedBadgeProps {
  label?: string;
  className?: string;
}

/** Badge « SIMULÉ » à apposer sur toutes les données de démonstration. */
export function SimulatedBadge({ label = 'SIMULÉ', className }: SimulatedBadgeProps) {
  return (
    <Badge tone="warning" className={className}>
      {label}
    </Badge>
  );
}
