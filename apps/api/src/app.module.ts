import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

// TODO: Validation will use Zod contracts rather than global NestJS ValidationPipe.
@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
