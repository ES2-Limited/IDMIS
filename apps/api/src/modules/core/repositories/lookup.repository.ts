import { and, asc, eq } from '@idmis/db';
import { db, lookupType, lookupValue } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';
import type { ModuleKey } from '@idmis/contracts';

export interface CreateLookupTypeData {
  id?: string;
  key: string;
  name: string;
  module: ModuleKey;
  isSystem?: boolean;
}

export interface CreateLookupValueData {
  id?: string;
  lookupTypeId: string;
  code: string;
  label: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateLookupValueData {
  label?: string;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class LookupRepository {
  async listTypes(module?: ModuleKey, txDb: DatabaseOrTx = db) {
    let query = txDb.select().from(lookupType).orderBy(lookupType.name);
    if (module) {
      query = query.where(eq(lookupType.module, module)) as typeof query;
    }
    return query;
  }

  async findTypeByKey(key: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb.select().from(lookupType).where(eq(lookupType.key, key)).limit(1);
    return row ?? null;
  }

  async findTypeById(id: string, txDb: DatabaseOrTx = db) {
    const [row] = await txDb.select().from(lookupType).where(eq(lookupType.id, id)).limit(1);
    return row ?? null;
  }

  async createType(data: CreateLookupTypeData, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .insert(lookupType)
      .values({
        id: data.id ?? crypto.randomUUID(),
        key: data.key,
        name: data.name,
        module: data.module,
        isSystem: data.isSystem ?? false,
      })
      .returning();
    return row;
  }

  async listValues(typeKeyOrId: string, isActive?: boolean, txDb: DatabaseOrTx = db) {
    const typeRow = await txDb
      .select({ id: lookupType.id })
      .from(lookupType)
      .where(eq(lookupType.key, typeKeyOrId))
      .limit(1);
    const lookupTypeId = typeRow[0]?.id ?? typeKeyOrId;

    const conditions = [eq(lookupValue.lookupTypeId, lookupTypeId)];
    if (isActive !== undefined) {
      conditions.push(eq(lookupValue.isActive, isActive));
    }

    return txDb
      .select()
      .from(lookupValue)
      .where(and(...conditions))
      .orderBy(asc(lookupValue.sortOrder), asc(lookupValue.label));
  }

  async createValue(data: CreateLookupValueData, txDb: DatabaseOrTx = db) {
    const [row] = await txDb
      .insert(lookupValue)
      .values({
        id: data.id ?? crypto.randomUUID(),
        lookupTypeId: data.lookupTypeId,
        code: data.code,
        label: data.label,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      })
      .returning();
    return row;
  }

  async updateValue(id: string, data: UpdateLookupValueData, txDb: DatabaseOrTx = db) {
    const [updated] = await txDb
      .update(lookupValue)
      .set(data)
      .where(eq(lookupValue.id, id))
      .returning();
    return updated ?? null;
  }
}
