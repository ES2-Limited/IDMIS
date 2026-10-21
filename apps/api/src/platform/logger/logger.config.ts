import type { FastifyServerOptions, FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getFastifyLoggerConfig(): FastifyServerOptions['logger'] {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.ip,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-refresh-token"]',
      'password',
      'passwordHash',
      'totpSecretEnc',
    ],
  };
}

export function genRequestId(req: { headers: Record<string, unknown> }): string {
  const raw = (req.headers['x-request-id'] as string) || (req.headers['request-id'] as string);
  if (raw && typeof raw === 'string' && UUID_REGEX.test(raw)) {
    return raw;
  }
  return crypto.randomUUID();
}

export function registerRequestIdHook(fastify: FastifyInstance): void {
  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
}
