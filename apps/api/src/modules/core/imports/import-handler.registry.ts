import { Injectable, Logger } from '@nestjs/common';
import type { ImportDatasetHandler } from './import-handler.interface';

@Injectable()
export class ImportHandlerRegistry {
  private readonly logger = new Logger(ImportHandlerRegistry.name);
  private readonly handlers = new Map<string, ImportDatasetHandler>();

  register(handler: ImportDatasetHandler): void {
    if (this.handlers.has(handler.dataset)) {
      this.logger.warn(`Overwriting import handler for dataset '${handler.dataset}'`);
    }
    this.handlers.set(handler.dataset, handler);
  }

  get(dataset: string): ImportDatasetHandler | undefined {
    return this.handlers.get(dataset);
  }

  has(dataset: string): boolean {
    return this.handlers.has(dataset);
  }

  getAll(): ImportDatasetHandler[] {
    return Array.from(this.handlers.values());
  }
}
