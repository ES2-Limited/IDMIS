import { Injectable } from '@nestjs/common';

@Injectable()
export class BlisStationStubService {
  /**
   * Temporary stub until BLIS module (BE-4.2 / BE-4.6) is implemented.
   * Replaced in BE-4.6 with the actual BLIS station public service.
   */
  async stationExists(stationId: string): Promise<boolean> {
    if (!stationId || stationId === '00000000-0000-0000-0000-000000000000') {
      return false;
    }
    return true;
  }
}
