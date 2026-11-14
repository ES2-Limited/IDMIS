import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SyncEngine, type SyncState, localDb, LocalStore } from '@idmis/sync';
import { useAuth } from '../auth';
import { useScope } from '../shell/ScopeContext';
import { getOrCreateDeviceInfo, ensureDeviceRegistered } from './device';

export interface SyncContextValue {
  syncState: SyncState;
  pendingOpsCount: number;
  lastSyncedAt: Date | null;
  triggerSync: () => Promise<void>;
  engine: SyncEngine;
  store: LocalStore;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { client, isAuthenticated, user } = useAuth();
  const { currentScope } = useScope();
  const queryClient = useQueryClient();

  const store = useMemo(() => new LocalStore(localDb), []);
  const { deviceId } = useMemo(() => getOrCreateDeviceInfo(), []);

  const engine = useMemo(() => {
    return new SyncEngine({
      apiClient: client,
      store,
      deviceId,
    });
  }, [client, store, deviceId]);

  // Ensure device is registered with backend once user is authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      ensureDeviceRegistered(user.id);
    }
  }, [isAuthenticated, user?.id]);

  const [syncState, setSyncState] = useState<SyncState>(engine.getState());
  const [pendingOpsCount, setPendingOpsCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Subscribe to engine state changes
  useEffect(() => {
    const unsubscribe = engine.subscribe((state) => {
      setSyncState(state);
      store.getPendingOps().then((ops) => setPendingOpsCount(ops.length));
    });
    return unsubscribe;
  }, [engine, store]);

  // Initial count of pending operations
  useEffect(() => {
    store.getPendingOps().then((ops) => setPendingOpsCount(ops.length));
  }, [store]);

  const triggerSync = useCallback(async () => {
    if (!isAuthenticated) return;
    const scopeKey = currentScope.type === 'national' ? 'national' : currentScope.id;
    await engine.sync(scopeKey);
    setLastSyncedAt(new Date());
    const ops = await store.getPendingOps();
    setPendingOpsCount(ops.length);
    // Invalidate active query caches so screens update reactively without browser reload
    await queryClient.invalidateQueries();
  }, [engine, store, isAuthenticated, currentScope, queryClient]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      triggerSync();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [triggerSync]);

  const value = useMemo<SyncContextValue>(
    () => ({
      syncState,
      pendingOpsCount,
      lastSyncedAt,
      triggerSync,
      engine,
      store,
    }),
    [syncState, pendingOpsCount, lastSyncedAt, triggerSync, engine, store],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return ctx;
}
