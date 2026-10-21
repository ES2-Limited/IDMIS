import { z } from 'zod';
import {
  ProblemDetailsSchema,
  ConflictProblemSchema,
  ValidationErrorItemSchema,
  SampleEchoInputSchema,
  SampleEchoResponseSchema,
  AppUserResponseSchema,
  OrganisationResponseSchema,
  WuaResponseSchema,
  RoleResponseSchema,
  AssignmentResponseSchema,
} from '@idmis/contracts';

export interface OpenApiDoc {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
  };
}

export function buildOpenApiDocument(): OpenApiDoc {
  const schemas: Record<string, unknown> = {
    ProblemDetails: z.toJSONSchema(ProblemDetailsSchema),
    ConflictProblem: z.toJSONSchema(ConflictProblemSchema),
    ValidationErrorItem: z.toJSONSchema(ValidationErrorItemSchema),
    AppUserResponse: z.toJSONSchema(AppUserResponseSchema),
    OrganisationResponse: z.toJSONSchema(OrganisationResponseSchema),
    WuaResponse: z.toJSONSchema(WuaResponseSchema),
    RoleResponse: z.toJSONSchema(RoleResponseSchema),
    AssignmentResponse: z.toJSONSchema(AssignmentResponseSchema),
  };

  const isDevOrTest = process.env.NODE_ENV !== 'production';

  const paths: Record<string, Record<string, unknown>> = {
    '/health': {
      get: {
        summary: 'Health check',
        description: 'Returns service health status',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  if (isDevOrTest) {
    schemas.SampleEchoInput = z.toJSONSchema(SampleEchoInputSchema);
    schemas.SampleEchoResponse = z.toJSONSchema(SampleEchoResponseSchema);

    paths['/sample/echo'] = {
      post: {
        summary: 'Sample Echo Endpoint',
        description: 'Demonstrates Zod validation, idempotency and RFC 9457 error formatting',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string', format: 'uuid' },
            description: 'Optional UUID idempotency key to prevent duplicate processing',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SampleEchoInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Echo response',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SampleEchoResponse' },
              },
            },
          },
          '400': {
            description: 'Validation error in RFC 9457 Problem Details format',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          '409': {
            description: 'Optimistic concurrency conflict',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ConflictProblem' },
              },
            },
          },
        },
      },
    };

    paths['/sample/conflict-test'] = {
      get: {
        summary: 'Sample 409 Conflict Test',
        description: 'Demonstrates 409 Conflict Problem response',
        responses: {
          '409': {
            description: 'Conflict problem details',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ConflictProblem' },
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'TRIMING IDMIS 2.0 API',
      version: '0.1.0',
      description: 'TRIMING Irrigation Data Management Information System API',
    },
    servers: [
      {
        url: '/',
        description: 'Base API URL',
      },
    ],
    paths,
    components: {
      schemas,
    },
  };
}
