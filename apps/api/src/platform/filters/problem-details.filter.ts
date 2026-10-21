import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  ProblemDetailsSchema,
  ConflictProblemSchema,
  type ValidationErrorItem,
} from '@idmis/contracts';
import { ConflictProblemException } from './conflict-problem.exception';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      (request as unknown as { id?: string }).id ||
      'unknown-req';

    // Ensure X-Request-Id is always attached to the error response
    reply.header('x-request-id', requestId);

    const timestamp = new Date().toISOString();
    const instance = request.url;

    // 1. Handle ConflictProblemException (409 Conflict)
    if (exception instanceof ConflictProblemException) {
      const payload = ConflictProblemSchema.parse({
        type: exception.type || '/errors/conflict',
        title: exception.title || 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: exception.message,
        instance,
        code: exception.code,
        requestId,
        timestamp,
        current: exception.current,
        currentVersion: exception.currentVersion,
      });

      return reply
        .status(HttpStatus.CONFLICT)
        .header('content-type', 'application/problem+json; charset=utf-8')
        .send(payload);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Check if it's a 409 conflict thrown as standard HttpException with current record
      if (
        status === HttpStatus.CONFLICT &&
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const respObj = exceptionResponse as Record<string, unknown>;
        if ('current' in respObj && 'currentVersion' in respObj) {
          const payload = ConflictProblemSchema.parse({
            type: (respObj.type as string) || '/errors/conflict',
            title: (respObj.title as string) || 'Conflict',
            status: HttpStatus.CONFLICT,
            detail: (respObj.message as string) || exception.message,
            instance,
            code: (respObj.code as string) || 'VERSION_CONFLICT',
            requestId,
            timestamp,
            current: respObj.current,
            currentVersion: Number(respObj.currentVersion),
          });

          return reply
            .status(HttpStatus.CONFLICT)
            .header('content-type', 'application/problem+json; charset=utf-8')
            .send(payload);
        }
      }

      // Check for validation errors (400)
      if (
        status === HttpStatus.BAD_REQUEST &&
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const respObj = exceptionResponse as Record<string, unknown>;
        const rawErrors = respObj.errors;
        let errors: ValidationErrorItem[] | undefined;

        if (Array.isArray(rawErrors)) {
          errors = rawErrors.map((err) => {
            if (typeof err === 'object' && err !== null && 'field' in err && 'message' in err) {
              return {
                field: String((err as Record<string, unknown>).field),
                message: String((err as Record<string, unknown>).message),
                code: (err as Record<string, unknown>).code
                  ? String((err as Record<string, unknown>).code)
                  : undefined,
              };
            }
            return {
              field: 'payload',
              message: String(err),
            };
          });
        }

        const payload = ProblemDetailsSchema.parse({
          type: (respObj.type as string) || '/errors/validation-failed',
          title: (respObj.title as string) || 'Validation Failed',
          status: HttpStatus.BAD_REQUEST,
          detail: (respObj.message as string) || 'The payload contains invalid fields',
          instance,
          code: (respObj.code as string) || 'VALIDATION_ERROR',
          requestId,
          timestamp,
          errors,
        });

        return reply
          .status(HttpStatus.BAD_REQUEST)
          .header('content-type', 'application/problem+json; charset=utf-8')
          .send(payload);
      }

      // Check for 422 Unprocessable Entity or other custom ProblemDetails objects
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'type' in exceptionResponse
      ) {
        const respObj = exceptionResponse as Record<string, unknown>;
        const payload = ProblemDetailsSchema.parse({
          type: String(respObj.type),
          title: String(respObj.title || exception.name),
          status,
          detail: (respObj.detail as string) || (respObj.message as string) || exception.message,
          instance,
          requestId,
          timestamp,
        });

        return reply
          .status(status)
          .header('content-type', 'application/problem+json; charset=utf-8')
          .send(payload);
      }

      // Other standard HttpExceptions (401, 403, 404, 409, etc.)
      const detail =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : typeof exceptionResponse === 'object' &&
              exceptionResponse !== null &&
              'message' in exceptionResponse
            ? Array.isArray((exceptionResponse as Record<string, unknown>).message)
              ? ((exceptionResponse as Record<string, unknown>).message as string[]).join(', ')
              : String((exceptionResponse as Record<string, unknown>).message)
            : exception.message;

      const title =
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'error' in exceptionResponse
          ? String((exceptionResponse as Record<string, unknown>).error)
          : exception.name.replace(/Exception$/, '');

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const payload = ProblemDetailsSchema.parse({
        type: `/errors/${slug}`,
        title,
        status,
        detail,
        instance,
        requestId,
        timestamp,
      });

      return reply
        .status(status)
        .header('content-type', 'application/problem+json; charset=utf-8')
        .send(payload);
    }

    // Unhandled / Unexpected server errors (500)
    // Log the full error with the requestId
    this.logger.error(
      {
        reqId: requestId,
        err:
          exception instanceof Error
            ? { message: exception.message, stack: exception.stack }
            : exception,
      },
      'Unhandled internal server error',
    );

    // Return a 500 problem with type /errors/internal, title, status and requestId only
    const payload = ProblemDetailsSchema.parse({
      type: '/errors/internal',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      requestId,
    });

    return reply
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .header('content-type', 'application/problem+json; charset=utf-8')
      .send(payload);
  }
}
