import { Injectable } from '@nestjs/common';
import { GeographyRepository } from '../repositories/geography.repository';

@Injectable()
export class GeographyService {
  constructor(private readonly geoRepo: GeographyRepository) {}

  async listStates() {
    return this.geoRepo.listStates();
  }

  async listLgas(stateId?: string) {
    return this.geoRepo.listLgas(stateId);
  }

  async listWards(lgaId?: string, stateId?: string) {
    return this.geoRepo.listWards(lgaId, stateId);
  }
}
