import { Injectable, NotFoundException } from '@nestjs/common';
import { IndicatorRepository } from '../repositories/indicator.repository';

@Injectable()
export class IndicatorService {
  constructor(private readonly indicatorRepo: IndicatorRepository) {}

  async getIndicator(id: string) {
    const ind = await this.indicatorRepo.findById(id);
    if (!ind) {
      throw new NotFoundException(`Indicator with ID '${id}' not found`);
    }
    return ind;
  }

  async getIndicatorByCode(code: string, frameworkId?: string) {
    const ind = await this.indicatorRepo.findByCode(code, frameworkId);
    if (!ind) {
      throw new NotFoundException(`Indicator with Code '${code}' not found`);
    }
    return ind;
  }

  async listIndicators(frameworkId?: string) {
    return this.indicatorRepo.listIndicators(frameworkId);
  }
}
