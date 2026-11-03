import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { SyncEngine, type SyncState, localDb, LocalStore } from '@idmis/sync';
import { useAuth } from '../auth';
import { useScope } from '../shell/ScopeContext';

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
  const { client, isAuthenticated } = useAuth();
  const { currentScope } = useScope();

  const store = useMemo(() => new LocalStore(localDb), []);
  const engine = useMemo(() => {
    return new SyncEngine({
      apiClient: client,
      store,
      deviceId: 'web-pwa-client',
    });
  }, [client, store]);

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
    try {
      const scopeKey = currentScope.type === 'national' ? 'national' : currentScope.id;
      await engine.sync(scopeKey);
      setLastSyncedAt(new Date());
      const ops = await store.getPendingOps();
      setPendingOpsCount(ops.length);
    } catch {
      // syncState will reflect 'error'
    }
  }, [engine, store, isAuthenticated, currentScope]);

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
