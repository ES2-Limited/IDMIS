import * as React from 'react';
import { useSync } from '../../../sync';
import type { OutboxOp, LocalRecord } from '@idmis/sync';

export function useFieldOfflineQueue() {
  const { store, pendingOpsCount, syncState, triggerSync, lastSyncedAt } = useSync();
  const [operations, setOperations] = React.useState<OutboxOp[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadOperations = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const ops = await store.getPendingOps();
      setOperations(ops);
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  }, [store]);

  React.useEffect(() => {
    loadOperations();
  }, [loadOperations, pendingOpsCount]);

  const queueCreate = React.useCallback(
    async (
      entity: string,
      recordId: string,
      payload: Record<string, unknown>,
      options?: { schemeId?: string | null; stateId?: string | null },
    ) => {
      const result = await store.commitInsert(entity, recordId, payload, options);
      await loadOperations();
      return result;
    },
    [store, loadOperations],
  );

  const queueUpdate = React.useCallback(
    async (entity: string, recordId: string, payload: Record<string, unknown>) => {
      const result = await store.commitUpdate(entity, recordId, payload);
      await loadOperations();
      return result;
    },
    [store, loadOperations],
  );

  const queueDelete = React.useCallback(
    async (entity: string, recordId: string) => {
      const result = await store.commitDelete(entity, recordId);
      await loadOperations();
      return result;
    },
    [store, loadOperations],
  );

  const listLocalRecords = React.useCallback(
    async (
      entity: string,
      filters?: { schemeId?: string | null; stateId?: string | null },
    ): Promise<LocalRecord[]> => {
      return store.listRecords(entity, filters);
    },
    [store],
  );

  return {
    operations,
    pendingOpsCount,
    isLoading,
    syncState,
    lastSyncedAt,
    triggerSync,
    queueCreate,
    queueUpdate,
    queueDelete,
    listLocalRecords,
    refreshQueue: loadOperations,
  };
}
