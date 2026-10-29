import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ModuleKey } from '@idmis/contracts';
import { LookupRepository } from '../repositories/lookup.repository';

@Injectable()
export class LookupService {
  constructor(private readonly lookupRepo: LookupRepository) {}

  async listTypes(module?: ModuleKey) {
    return this.lookupRepo.listTypes(module);
  }

  async createType(data: { key: string; name: string; module: ModuleKey; isSystem?: boolean }) {
    const existing = await this.lookupRepo.findTypeByKey(data.key);
    if (existing) {
      throw new ConflictException(`Lookup type '${data.key}' already exists`);
    }
    return this.lookupRepo.createType(data);
  }

  async listValues(typeKey: string, isActive?: boolean) {
    return this.lookupRepo.listValues(typeKey, isActive);
  }

  async createValue(data: {
    lookupTypeId: string;
    code: string;
    label: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const typeRow = await this.lookupRepo.findTypeById(data.lookupTypeId);
    if (!typeRow) {
      throw new NotFoundException(`Lookup type '${data.lookupTypeId}' not found`);
    }
    return this.lookupRepo.createValue(data);
  }

  async updateValue(id: string, data: { label?: string; sortOrder?: number; isActive?: boolean }) {
    const updated = await this.lookupRepo.updateValue(id, data);
    if (!updated) {
      throw new NotFoundException(`Lookup value '${id}' not found`);
    }
    return updated;
  }
}
