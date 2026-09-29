import logoUrl from '@/assets/mada.png';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
}

/**
 * Logo officiel « MadaRisk » (assets/mada.png). L'image inclut l'icône
 * et le nom de la marque, elle s'affiche donc seule dans l'interface de connexion.
 */
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <img
      src={logoUrl}
      alt="MadaRisk"
      className={cn('h-16 w-auto shrink-0', className)}
    />
  );
}