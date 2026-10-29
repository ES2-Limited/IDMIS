import { eq, isNull } from '@idmis/db';
import { db, lga, state, ward } from '@idmis/db';
import { Injectable } from '@nestjs/common';
import type { DatabaseOrTx } from './file.repository';

@Injectable()
export class GeographyRepository {
  async listStates(txDb: DatabaseOrTx = db) {
    return txDb
      .select({
        id: state.id,
        code: state.code,
        name: state.name,
      })
      .from(state)
      .where(isNull(state.deletedAt))
      .orderBy(state.name);
  }

  async listLgas(stateId?: string, txDb: DatabaseOrTx = db) {
    let query = txDb
      .select({
        id: lga.id,
        stateId: lga.stateId,
        code: lga.code,
        name: lga.name,
      })
      .from(lga)
      .orderBy(lga.name);

    if (stateId) {
      query = query.where(eq(lga.stateId, stateId)) as typeof query;
    }

    return query;
  }

  async listWards(lgaId?: string, stateId?: string, txDb: DatabaseOrTx = db) {
    let query = txDb
      .select({
        id: ward.id,
        lgaId: ward.lgaId,
        code: ward.code,
        name: ward.name,
      })
      .from(ward)
      .innerJoin(lga, eq(ward.lgaId, lga.id))
      .orderBy(ward.name);

    if (lgaId) {
      query = query.where(eq(ward.lgaId, lgaId)) as typeof query;
    } else if (stateId) {
      query = query.where(eq(lga.stateId, stateId)) as typeof query;
    }

    return query;
  }
}
