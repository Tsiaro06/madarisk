import { WeatherProvider } from '../types/weather.types';
import { openMeteoProvider } from './openmeteo.provider';

let activeProvider: WeatherProvider = openMeteoProvider;

export function getWeatherProvider(): WeatherProvider {
  return activeProvider;
}

export function setWeatherProvider(provider: WeatherProvider): void {
  activeProvider = provider;
}
