import { eq } from '@idmis/db';
import { db, setting } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';

@Injectable()
export class SettingRepository {
  async listSettings(txDb: DatabaseOrTx = db) {
    return txDb.select().from(setting).orderBy(setting.key);
  }

  async getByKey(key: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb.select().from(setting).where(eq(setting.key, key)).limit(1);
    return row ?? null;
  }

  async setByKey(key: string, value: unknown, updatedBy?: string, txDb: DatabaseOrTx = db) {
    const [saved] = await txDb
      .insert(setting)
      .values({
        key,
        value,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy ?? '00000000-0000-7000-8000-000000000001',
      })
      .onConflictDoUpdate({
        target: setting.key,
        set: {
          value,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy ?? '00000000-0000-7000-8000-000000000001',
        },
      })
      .returning();
    return saved;
  }
}
