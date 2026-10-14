import { createContext, useContext } from 'react';
import type { AppConfig } from './types';

export const ConfigContext = createContext<AppConfig | null>(null);

export function useConfig(): AppConfig {
  const cfg = useContext(ConfigContext);
  if (!cfg) throw new Error('ConfigContext missing');
  return cfg;
}
