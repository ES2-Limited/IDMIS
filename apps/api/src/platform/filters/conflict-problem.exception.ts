import { HttpException, HttpStatus } from '@nestjs/common';

export interface ConflictProblemOptions {
  detail?: string;
  current: unknown;
  currentVersion: number;
  code?: string;
  type?: string;
  title?: string;
}

export class ConflictProblemException extends HttpException {
  readonly current: unknown;
  readonly currentVersion: number;
  readonly code: string;
  readonly type: string;
  readonly title: string;

  constructor(options: ConflictProblemOptions) {
    super(
      options.detail || 'Record was modified concurrently by another user',
      HttpStatus.CONFLICT,
    );
    this.current = options.current;
    this.currentVersion = options.currentVersion;
    this.code = options.code || 'VERSION_CONFLICT';
    this.type = options.type || '/errors/conflict';
    this.title = options.title || 'Conflict';
  }
}
