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
  SignInInputSchema,
  SignInResponseSchema,
  TotpSetupInputSchema,
  TotpSetupResponseSchema,
  TotpVerifyInputSchema,
  RefreshTokenInputSchema,
  RefreshTokenResponseSchema,
  SignOutResponseSchema,
  ChangePasswordInputSchema,
  ChangePasswordResponseSchema,
  AdminResetPasswordInputSchema,
  AdminResetPasswordResponseSchema,
  AuthMeResponseSchema,
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
    securitySchemes?: Record<string, unknown>;
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

    // Auth Schemas
    SignInInput: z.toJSONSchema(SignInInputSchema),
    SignInResponse: z.toJSONSchema(SignInResponseSchema),
    TotpSetupInput: z.toJSONSchema(TotpSetupInputSchema),
    TotpSetupResponse: z.toJSONSchema(TotpSetupResponseSchema),
    TotpVerifyInput: z.toJSONSchema(TotpVerifyInputSchema),
    RefreshTokenInput: z.toJSONSchema(RefreshTokenInputSchema),
    RefreshTokenResponse: z.toJSONSchema(RefreshTokenResponseSchema),
    SignOutResponse: z.toJSONSchema(SignOutResponseSchema),
    ChangePasswordInput: z.toJSONSchema(ChangePasswordInputSchema),
    ChangePasswordResponse: z.toJSONSchema(ChangePasswordResponseSchema),
    AdminResetPasswordInput: z.toJSONSchema(AdminResetPasswordInputSchema),
    AdminResetPasswordResponse: z.toJSONSchema(AdminResetPasswordResponseSchema),
    AuthMeResponse: z.toJSONSchema(AuthMeResponseSchema),
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
    '/auth/sign-in': {
      post: {
        summary: 'User sign in',
        tags: ['Authentication'],
        description:
          'Authenticate user with email and password, establishing session or prompting next factor',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SignInInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication result or next-step prompt',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignInResponse' },
              },
            },
          },
          '401': {
            description: 'Invalid credentials or inactive account',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
          '429': {
            description: 'Account locked due to 5 failed attempts',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
    },
    '/auth/totp/setup': {
      post: {
        summary: 'Setup TOTP authenticator',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TotpSetupInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'TOTP secret, otpauth URI and 10 recovery codes',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TotpSetupResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/totp/verify': {
      post: {
        summary: 'Verify TOTP code or recovery code',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TotpVerifyInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication result or password change prompt',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignInResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate refresh token and get new access token',
        tags: ['Authentication'],
        responses: {
          '200': {
            description: 'Rotated session and new access token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RefreshTokenResponse' },
              },
            },
          },
          '401': {
            description: 'Invalid, expired, or reused refresh token',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
    },
    '/auth/sign-out': {
      post: {
        summary: 'Sign out and revoke session',
        tags: ['Authentication'],
        responses: {
          '200': {
            description: 'Session revoked successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignOutResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get current user profile, roles, and scope',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user profile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthMeResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/problem+json': {
                schema: { $ref: '#/components/schemas/ProblemDetails' },
              },
            },
          },
        },
      },
    },
    '/auth/change-password': {
      post: {
        summary: 'Change password',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChangePasswordInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Password changed successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChangePasswordResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        summary: 'Admin reset password for user',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminResetPasswordInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Temporary password generated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AdminResetPasswordResponse' },
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
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  };
}
