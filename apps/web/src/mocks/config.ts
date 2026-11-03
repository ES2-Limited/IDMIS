export interface MockConfig {
  auth: boolean;
  core: boolean;
  slis: boolean;
  me: boolean;
  blis: boolean;
}

const STORAGE_KEY = 'idmis_mock_config';

const defaultMocks: MockConfig = {
  auth: true,
  core: true,
  slis: true,
  me: true,
  blis: true,
};

const memoryConfig: MockConfig = { ...defaultMocks };

export function getMockConfig(): MockConfig {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ...memoryConfig };
  }
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    return item ? { ...defaultMocks, ...JSON.parse(item) } : { ...memoryConfig };
  } catch {
    return { ...memoryConfig };
  }
}

export function setMockFlag(moduleKey: keyof MockConfig, enabled: boolean): void {
  memoryConfig[moduleKey] = enabled;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const current = getMockConfig();
      current[moduleKey] = enabled;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      window.dispatchEvent(new Event('idmis_mock_config_changed'));
    } catch {
      // ignore storage errors
    }
  }
}

export function isMockEnabled(moduleKey: keyof MockConfig): boolean {
  return getMockConfig()[moduleKey];
}
