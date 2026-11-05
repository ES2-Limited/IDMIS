import { Injectable, Optional } from '@nestjs/common';
import { StationRepository } from '../repositories/station.repository';

@Injectable()
export class BlisStationStubService {
  constructor(@Optional() private readonly stationRepository?: StationRepository) {}

  /**
   * Temporary stub / public check until BE-4.6 completes full station integrations.
   */
  async stationExists(stationId: string): Promise<boolean> {
    if (!stationId || stationId === '00000000-0000-0000-0000-000000000000') {
      return false;
    }
    if (this.stationRepository) {
      const station = await this.stationRepository.findById(stationId);
      return !!station;
    }
    return true;
  }
}

export * from '../services/blis-asset.service';
export * from '../services/blis-compute-query.service';
export * from '../services/dam-inspection.service';
export * from '../repositories/basin.repository';
export * from '../repositories/station.repository';
export * from '../repositories/reservoir.repository';
export * from '../repositories/dam.repository';
export * from '../repositories/dam-inspection.repository';
export * from '../repositories/basin-morphometry.repository';
