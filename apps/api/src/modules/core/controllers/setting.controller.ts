import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { permissions } from '@idmis/contracts';
import { SettingService } from '../services/setting.service';
import { Can, CurrentUser } from '../../../platform/auth';
import type { RequestUser } from '../../../platform/context';

@Controller('admin/settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Get()
  @Can(permissions.CORE_SETTING_READ)
  async listSettings() {
    return this.settingService.listSettings();
  }

  @Patch(':key')
  @Can(permissions.CORE_SETTING_MANAGE)
  async updateSetting(
    @Param('key') key: string,
    @Body() body: { value: unknown },
    @CurrentUser() user: RequestUser,
  ) {
    return this.settingService.updateSetting(key, body.value, user.id);
  }
}
