import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  permissions,
  type CreateBasinInput,
  type UpdateBasinInput,
  type ListBasinsQuery,
  type CreateBasinMorphometryInput,
  type UpdateBasinMorphometryInput,
  type ListBasinMorphometryQuery,
  type CreateStationInput,
  type UpdateStationInput,
  type ListStationsQuery,
  type CreateReservoirInput,
  type UpdateReservoirInput,
  type ListReservoirsQuery,
  type CreateDamInput,
  type UpdateDamInput,
  type ListDamsQuery,
  type GetStationReadingsQuery,
} from '@idmis/contracts';
import { BasinRepository } from '../repositories/basin.repository';
import { BasinMorphometryRepository } from '../repositories/basin-morphometry.repository';
import { StationRepository } from '../repositories/station.repository';
import { ReservoirRepository } from '../repositories/reservoir.repository';
import { DamRepository } from '../repositories/dam.repository';
import { ReadingRepository } from '../repositories/reading.repository';
import { assertBlisScope } from '../utils/assert-blis-scope';
import { runInTransaction } from '../../../platform/database/transaction.helper';
import type { UserAuthz } from '../../../platform/auth';

@Injectable()
export class BlisAssetService {
  constructor(
    private readonly basinRepo: BasinRepository,
    private readonly basinMorphometryRepo: BasinMorphometryRepository,
    private readonly stationRepo: StationRepository,
    private readonly reservoirRepo: ReservoirRepository,
    private readonly damRepo: DamRepository,
    private readonly readingRepo: ReadingRepository,
  ) {}

  // =========================================================================
  // 1. Basin
  // =========================================================================

  async listBasins(query: ListBasinsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    return this.basinRepo.list(query, scope);
  }

  async getBasin(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    const item = await this.basinRepo.findById(id, scope);
    if (!item) {
      throw new NotFoundException('Basin not found');
    }
    return item;
  }

  async createBasin(input: CreateBasinInput, authz: UserAuthz, actorUserId: string) {
    await assertBlisScope(authz, permissions.BLIS_BASIN_MANAGE, {
      rbdaId: input.rbdaId ?? null,
    });

    const existing = await this.basinRepo.findByCode(input.code);
    if (existing) {
      throw new ConflictException(`Basin with code '${input.code}' already exists`);
    }

    return runInTransaction(
      async (tx) => {
        return this.basinRepo.create(
          {
            ...input,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'blis.basin',
          actorUserId,
        },
      },
    );
  }

  async updateBasin(
    id: string,
    expectedVersion: number,
    input: UpdateBasinInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_MANAGE);
    const existing = await this.basinRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Basin not found');
    }

    await assertBlisScope(authz, permissions.BLIS_BASIN_MANAGE, {
      rbdaId: existing.rbdaId,
    });

    if (input.rbdaId !== undefined && input.rbdaId !== existing.rbdaId) {
      await assertBlisScope(authz, permissions.BLIS_BASIN_MANAGE, {
        rbdaId: input.rbdaId,
      });
    }

    if (input.code && input.code !== existing.code) {
      const codeTaken = await this.basinRepo.findByCode(input.code);
      if (codeTaken) {
        throw new ConflictException(`Basin with code '${input.code}' already exists`);
      }
    }

    return runInTransaction(
      async (tx) => {
        return this.basinRepo.update(id, expectedVersion, { ...input, updatedBy: actorUserId }, tx);
      },
      {
        audit: {
          action: 'update',
          entity: 'blis.basin',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  async deleteBasin(id: string, expectedVersion: number, authz: UserAuthz, actorUserId: string) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_MANAGE);
    const existing = await this.basinRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Basin not found');
    }

    await assertBlisScope(authz, permissions.BLIS_BASIN_MANAGE, {
      rbdaId: existing.rbdaId,
    });

    return runInTransaction(
      async (tx) => {
        return this.basinRepo.softDelete(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'blis.basin',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  // =========================================================================
  // 2. Basin Morphometry
  // =========================================================================

  async listBasinMorphometry(query: ListBasinMorphometryQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    return this.basinMorphometryRepo.list(query, scope);
  }

  async getBasinMorphometry(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    const item = await this.basinMorphometryRepo.findById(id, scope);
    if (!item) {
      throw new NotFoundException('Basin morphometry not found');
    }
    return item;
  }

  async createBasinMorphometry(
    input: CreateBasinMorphometryInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    await assertBlisScope(authz, permissions.BLIS_BASIN_MANAGE, {
      basinId: input.basinId,
    });

    const existing = await this.basinMorphometryRepo.findByBasinAndDate(
      input.basinId,
      input.measuredOn,
    );
    if (existing) {
      throw new ConflictException(
        `Morphometry record already exists for basin ${input.basinId} on date ${input.measuredOn}`,
      );
    }

    return runInTransaction(
      async (tx) => {
        return this.basinMorphometryRepo.create(
          {
            ...input,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'blis.basin_morphometry',
          actorUserId,
        },
      },
    );
  }

  async updateBasinMorphometry(
    id: string,
    expectedVersion: number,
    input: UpdateBasinMorphometryInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_MANAGE);
    const existing = await this.basinMorphometryRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Basin morphometry not found');
    }

    await assertBlisScope(authz, permissions.BLIS_BASIN_MANAGE, {
      basinId: existing.basinId,
    });

    if (input.basinId && input.basinId !== existing.basinId) {
      await assertBlisScope(authz, permissions.BLIS_BASIN_MANAGE, {
        basinId: input.basinId,
      });
    }

    return runInTransaction(
      async (tx) => {
        return this.basinMorphometryRepo.update(
          id,
          expectedVersion,
          { ...input, updatedBy: actorUserId },
          tx,
        );
      },
      {
        audit: {
          action: 'update',
          entity: 'blis.basin_morphometry',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  async deleteBasinMorphometry(
    id: string,
    expectedVersion: number,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_MANAGE);
    const existing = await this.basinMorphometryRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Basin morphometry not found');
    }

    await assertBlisScope(authz, permissions.BLIS_BASIN_MANAGE, {
      basinId: existing.basinId,
    });

    return runInTransaction(
      async (tx) => {
        return this.basinMorphometryRepo.softDelete(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'blis.basin_morphometry',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  // =========================================================================
  // 3. Station
  // =========================================================================

  async listStations(query: ListStationsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    return this.stationRepo.list(query, scope);
  }

  async getStation(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    const item = await this.stationRepo.findById(id, scope);
    if (!item) {
      throw new NotFoundException('Station not found');
    }
    return item;
  }

  async createStation(input: CreateStationInput, authz: UserAuthz, actorUserId: string) {
    await assertBlisScope(authz, permissions.BLIS_STATION_MANAGE, {
      basinId: input.basinId,
    });

    const existing = await this.stationRepo.findByCode(input.code);
    if (existing) {
      throw new ConflictException(`Station with code '${input.code}' already exists`);
    }

    return runInTransaction(
      async (tx) => {
        return this.stationRepo.create(
          {
            ...input,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'blis.station',
          actorUserId,
        },
      },
    );
  }

  async updateStation(
    id: string,
    expectedVersion: number,
    input: UpdateStationInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_STATION_MANAGE);
    const existing = await this.stationRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Station not found');
    }

    await assertBlisScope(authz, permissions.BLIS_STATION_MANAGE, {
      basinId: existing.basinId,
    });

    if (input.basinId && input.basinId !== existing.basinId) {
      await assertBlisScope(authz, permissions.BLIS_STATION_MANAGE, {
        basinId: input.basinId,
      });
    }

    if (input.code && input.code !== existing.code) {
      const codeTaken = await this.stationRepo.findByCode(input.code);
      if (codeTaken) {
        throw new ConflictException(`Station with code '${input.code}' already exists`);
      }
    }

    return runInTransaction(
      async (tx) => {
        return this.stationRepo.update(
          id,
          expectedVersion,
          { ...input, updatedBy: actorUserId },
          tx,
        );
      },
      {
        audit: {
          action: 'update',
          entity: 'blis.station',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  async deleteStation(id: string, expectedVersion: number, authz: UserAuthz, actorUserId: string) {
    const scope = authz.scopeFor(permissions.BLIS_STATION_MANAGE);
    const existing = await this.stationRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Station not found');
    }

    await assertBlisScope(authz, permissions.BLIS_STATION_MANAGE, {
      basinId: existing.basinId,
    });

    return runInTransaction(
      async (tx) => {
        return this.stationRepo.softDelete(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'blis.station',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  // =========================================================================
  // 4. Reservoir
  // =========================================================================

  async listReservoirs(query: ListReservoirsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    return this.reservoirRepo.list(query, scope);
  }

  async getReservoir(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    const item = await this.reservoirRepo.findById(id, scope);
    if (!item) {
      throw new NotFoundException('Reservoir not found');
    }
    return item;
  }

  async createReservoir(input: CreateReservoirInput, authz: UserAuthz, actorUserId: string) {
    await assertBlisScope(authz, permissions.BLIS_DAM_MANAGE, {
      basinId: input.basinId,
    });

    return runInTransaction(
      async (tx) => {
        return this.reservoirRepo.create(
          {
            ...input,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'blis.reservoir',
          actorUserId,
        },
      },
    );
  }

  async updateReservoir(
    id: string,
    expectedVersion: number,
    input: UpdateReservoirInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_DAM_MANAGE);
    const existing = await this.reservoirRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Reservoir not found');
    }

    await assertBlisScope(authz, permissions.BLIS_DAM_MANAGE, {
      basinId: existing.basinId,
    });

    if (input.basinId && input.basinId !== existing.basinId) {
      await assertBlisScope(authz, permissions.BLIS_DAM_MANAGE, {
        basinId: input.basinId,
      });
    }

    return runInTransaction(
      async (tx) => {
        return this.reservoirRepo.update(
          id,
          expectedVersion,
          { ...input, updatedBy: actorUserId },
          tx,
        );
      },
      {
        audit: {
          action: 'update',
          entity: 'blis.reservoir',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  async deleteReservoir(
    id: string,
    expectedVersion: number,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_DAM_MANAGE);
    const existing = await this.reservoirRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Reservoir not found');
    }

    await assertBlisScope(authz, permissions.BLIS_DAM_MANAGE, {
      basinId: existing.basinId,
    });

    return runInTransaction(
      async (tx) => {
        return this.reservoirRepo.softDelete(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'blis.reservoir',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  // =========================================================================
  // 5. Dam
  // =========================================================================

  async listDams(query: ListDamsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    return this.damRepo.list(query, scope);
  }

  async getDam(id: string, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_BASIN_READ);
    const item = await this.damRepo.findById(id, scope);
    if (!item) {
      throw new NotFoundException('Dam not found');
    }
    return item;
  }

  async createDam(input: CreateDamInput, authz: UserAuthz, actorUserId: string) {
    await assertBlisScope(authz, permissions.BLIS_DAM_MANAGE, {
      basinId: input.basinId,
    });

    return runInTransaction(
      async (tx) => {
        return this.damRepo.create(
          {
            ...input,
            createdBy: actorUserId,
          },
          tx,
        );
      },
      {
        audit: {
          action: 'create',
          entity: 'blis.dam',
          actorUserId,
        },
      },
    );
  }

  async updateDam(
    id: string,
    expectedVersion: number,
    input: UpdateDamInput,
    authz: UserAuthz,
    actorUserId: string,
  ) {
    const scope = authz.scopeFor(permissions.BLIS_DAM_MANAGE);
    const existing = await this.damRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Dam not found');
    }

    await assertBlisScope(authz, permissions.BLIS_DAM_MANAGE, {
      basinId: existing.basinId,
    });

    if (input.basinId && input.basinId !== existing.basinId) {
      await assertBlisScope(authz, permissions.BLIS_DAM_MANAGE, {
        basinId: input.basinId,
      });
    }

    return runInTransaction(
      async (tx) => {
        return this.damRepo.update(id, expectedVersion, { ...input, updatedBy: actorUserId }, tx);
      },
      {
        audit: {
          action: 'update',
          entity: 'blis.dam',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  async deleteDam(id: string, expectedVersion: number, authz: UserAuthz, actorUserId: string) {
    const scope = authz.scopeFor(permissions.BLIS_DAM_MANAGE);
    const existing = await this.damRepo.findById(id, scope);
    if (!existing) {
      throw new NotFoundException('Dam not found');
    }

    await assertBlisScope(authz, permissions.BLIS_DAM_MANAGE, {
      basinId: existing.basinId,
    });

    return runInTransaction(
      async (tx) => {
        return this.damRepo.softDelete(id, expectedVersion, actorUserId, tx);
      },
      {
        audit: {
          action: 'delete',
          entity: 'blis.dam',
          entityId: id,
          actorUserId,
        },
      },
    );
  }

  // =========================================================================
  // 6. Station Readings (BE-4.3)
  // =========================================================================

  async getStationReadings(stationId: string, query: GetStationReadingsQuery, authz: UserAuthz) {
    const scope = authz.scopeFor(permissions.BLIS_MEASUREMENT_READ);
    const station = await this.stationRepo.findById(stationId, scope);
    if (!station) {
      throw new NotFoundException('Station not found');
    }

    // Validate max range per request
    if (query.from && query.to) {
      const fromTime = new Date(query.from).getTime();
      const toTime = new Date(query.to).getTime();
      if (toTime < fromTime) {
        throw new BadRequestException("'to' date must be greater than or equal to 'from' date");
      }
      const diffMs = toTime - fromTime;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (query.interval === 'raw' && diffDays > 31) {
        throw new BadRequestException('Max range for raw readings is 31 days');
      }
      if (query.interval === 'day' && diffDays > 5 * 365.25) {
        throw new BadRequestException('Max range for daily readings is 5 years');
      }
    }

    const param = await this.readingRepo.resolveParameter(query.parameter);

    if (query.interval === 'raw') {
      return this.readingRepo.getRawReadings(stationId, param.id, param.code, query);
    }

    return this.readingRepo.getAggregatedReadings(
      stationId,
      param.id,
      param.code,
      param.defaultUnit,
      query,
      query.interval,
    );
  }
}
