import { generateUuidV7 } from '@idmis/sync';
import { getApiClient } from '@idmis/api-client';

const STORAGE_DEVICE_ID = 'idmis_client_device_id';
const STORAGE_INSTALLATION_ID = 'idmis_client_installation_id';
const STORAGE_REGISTERED_USER = 'idmis_device_registered_user';

export interface ClientDeviceInfo {
  deviceId: string;
  installationId: string;
}

/**
 * Returns a stable UUIDv7 device ID and installation ID for this client browser/PWA instance.
 * Persisted in localStorage so it remains constant across sessions and page reloads.
 */
export function getOrCreateDeviceInfo(): ClientDeviceInfo {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    const fallbackId = generateUuidV7();
    return { deviceId: fallbackId, installationId: fallbackId };
  }

  let deviceId = localStorage.getItem(STORAGE_DEVICE_ID);
  if (!deviceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
    deviceId = generateUuidV7();
    localStorage.setItem(STORAGE_DEVICE_ID, deviceId);
  }

  let installationId = localStorage.getItem(STORAGE_INSTALLATION_ID);
  if (!installationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(installationId)) {
    installationId = generateUuidV7();
    localStorage.setItem(STORAGE_INSTALLATION_ID, installationId);
  }

  return { deviceId, installationId };
}

/**
 * Ensures this device is registered with the server for the current authenticated user.
 */
export async function ensureDeviceRegistered(userId?: string): Promise<string> {
  const { deviceId, installationId } = getOrCreateDeviceInfo();
  if (!userId) return deviceId;

  const lastRegisteredUser = typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_REGISTERED_USER)
    : null;

  if (lastRegisteredUser === userId) {
    return deviceId;
  }

  try {
    const client = getApiClient();
    await client.registerDevice({
      id: deviceId,
      installationId,
      label: typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 50)} (PWA)` : 'PWA Client',
      platform: typeof navigator !== 'undefined' ? navigator.platform?.slice(0, 50) || 'web' : 'web',
    });

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_REGISTERED_USER, userId);
    }
  } catch (err) {
    console.warn('Could not register device online; continuing offline:', err);
  }

  return deviceId;
}

