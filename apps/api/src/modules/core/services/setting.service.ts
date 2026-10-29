import { Injectable, NotFoundException } from '@nestjs/common';
import { SettingRepository } from '../repositories/setting.repository';
import { runInTransaction } from '../../../platform/database/transaction.helper';

@Injectable()
export class SettingService {
  constructor(private readonly settingRepo: SettingRepository) {}

  async listSettings() {
    return this.settingRepo.listSettings();
  }

  async getSetting(key: string) {
    const s = await this.settingRepo.getByKey(key);
    if (!s) {
      throw new NotFoundException(`Setting '${key}' not found`);
    }
    return s;
  }

  async updateSetting(key: string, value: unknown, actorUserId: string) {
    const existing = await this.settingRepo.getByKey(key);

    return runInTransaction(
      async (tx) => {
        return this.settingRepo.setByKey(key, value, actorUserId, tx);
      },
      {
        audit: {
          actorType: 'user',
          actorUserId,
          action: 'update',
          entity: 'core.setting',
          entityId: key,
          before: existing,
          after: { key, value },
        },
      },
    );
  }
}
