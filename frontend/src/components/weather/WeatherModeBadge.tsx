import { Badge } from "@/components/ui/Badge";
import {
  WEATHER_VIEW_MODE_LABELS,
  type WeatherViewMode,
} from "@/types/weather";

interface WeatherModeBadgeProps {
  mode: WeatherViewMode;
}

const MODE_TONES: Record<WeatherViewMode, Parameters<typeof Badge>[0]["tone"]> =
  {
    OBSERVATION: "success",
    PREVISION: "brand",
    HISTORIQUE: "neutral",
  };

export function WeatherModeBadge({ mode }: WeatherModeBadgeProps) {
  return (
    <Badge tone={MODE_TONES[mode]}>
      {WEATHER_VIEW_MODE_LABELS[mode]}
    </Badge>
  );
}