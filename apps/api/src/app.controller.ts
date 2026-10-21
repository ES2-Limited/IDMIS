import { Controller, Get } from '@nestjs/common';
import { Public } from './platform/auth';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
