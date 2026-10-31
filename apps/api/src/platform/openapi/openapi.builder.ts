import { z } from 'zod';
import { slisSchemas, slisPaths } from './slis.openapi';
import {
  ProblemDetailsSchema,
  ConflictProblemSchema,
  ValidationErrorItemSchema,
  SampleEchoInputSchema,
  SampleEchoResponseSchema,
  AppUserResponseSchema,
  CreateAppUserInputSchema,
  UpdateAppUserInputSchema,
  ListAppUsersQuerySchema,
  OrganisationResponseSchema,
  CreateOrganisationInputSchema,
  UpdateOrganisationInputSchema,
  ListOrganisationsQuerySchema,
  WuaResponseSchema,
  CreateWuaInputSchema,
  UpdateWuaInputSchema,
  ListWuasQuerySchema,
  WuaOfficerResponseSchema,
  CreateWuaOfficerInputSchema,
  UpdateWuaOfficerInputSchema,
  ListWuaOfficersQuerySchema,
  RoleResponseSchema,
  AssignmentResponseSchema,
  CreateAssignmentInputSchema,
  ListAssignmentsQuerySchema,
  StateResponseSchema,
  ListStatesQuerySchema,
  LgaResponseSchema,
  ListLgasQuerySchema,
  WardResponseSchema,
  ListWardsQuerySchema,
  LookupTypeResponseSchema,
  CreateLookupTypeInputSchema,
  ListLookupTypesQuerySchema,
  LookupValueResponseSchema,
  CreateLookupValueInputSchema,
  UpdateLookupValueInputSchema,
  ListLookupValuesQuerySchema,
  SettingResponseSchema,
  SetSettingInputSchema,
  ListSettingsQuerySchema,
  FileResponseSchema,
  InitiateUploadInputSchema,
  InitiateUploadResponseSchema,
  CompleteUploadInputSchema,
  CompleteUploadResponseSchema,
  FileDownloadUrlResponseSchema,
  ListFilesQuerySchema,
  ImportBatchResponseSchema,
  InitiateImportInputSchema,
  ListImportBatchesQuerySchema,
  ImportPreviewResponseSchema,
  ImportSseTokenResponseSchema,
  ImportProgressMessageSchema,
  AuditLogResponseSchema,
  ListAuditLogsQuerySchema,
  ListDeadEventsResponseSchema,
  RequeueEventResponseSchema,
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
  UserAbilitiesResponseSchema,
} from '@idmis/contracts';

export interface OpenApiDoc {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description?: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

function toJsonSchema(schema: z.ZodTypeAny) {
  return z.toJSONSchema(schema, {
    unrepresentable: () => ({ type: 'string', format: 'date-time' }),
  });
}

function errors(codes: number[]) {
  const result: Record<string, unknown> = {};
  for (const code of codes) {
    const isConflict = code === 409;
    const schemaRef = isConflict
      ? '#/components/schemas/ConflictProblem'
      : '#/components/schemas/ProblemDetails';
    let description = 'RFC 9457 problem details';
    switch (code) {
      case 400:
        description = 'Bad Request - validation failure';
        break;
      case 401:
        description = 'Unauthorized - missing or invalid credentials';
        break;
      case 403:
        description = 'Forbidden - caller lacks required permission or scope';
        break;
      case 404:
        description = 'Not Found - target entity does not exist or outside scope';
        break;
      case 409:
        description = 'Conflict - optimistic concurrency version conflict or duplicate constraint';
        break;
      case 422:
        description = 'Unprocessable Entity - semantic validation or checksum mismatch';
        break;
    }
    result[String(code)] = {
      description,
      content: {
        'application/problem+json': {
          schema: { $ref: schemaRef },
        },
      },
    };
  }
  return result;
}

const SECURED = [{ bearerAuth: [] }];

export function buildOpenApiDocument(
  basePath = process.env.API_PUBLIC_BASE_PATH || '/',
): OpenApiDoc {
  const schemas: Record<string, unknown> = {
    // Platform & Errors
    ProblemDetails: toJsonSchema(ProblemDetailsSchema),
    ConflictProblem: toJsonSchema(ConflictProblemSchema),
    ValidationErrorItem: toJsonSchema(ValidationErrorItemSchema),

    // Auth
    SignInInput: toJsonSchema(SignInInputSchema),
    SignInResponse: toJsonSchema(SignInResponseSchema),
    TotpSetupInput: toJsonSchema(TotpSetupInputSchema),
    TotpSetupResponse: toJsonSchema(TotpSetupResponseSchema),
    TotpVerifyInput: toJsonSchema(TotpVerifyInputSchema),
    RefreshTokenInput: toJsonSchema(RefreshTokenInputSchema),
    RefreshTokenResponse: toJsonSchema(RefreshTokenResponseSchema),
    SignOutResponse: toJsonSchema(SignOutResponseSchema),
    ChangePasswordInput: toJsonSchema(ChangePasswordInputSchema),
    ChangePasswordResponse: toJsonSchema(ChangePasswordResponseSchema),
    AdminResetPasswordInput: toJsonSchema(AdminResetPasswordInputSchema),
    AdminResetPasswordResponse: toJsonSchema(AdminResetPasswordResponseSchema),
    AuthMeResponse: toJsonSchema(AuthMeResponseSchema),
    UserAbilitiesResponse: toJsonSchema(UserAbilitiesResponseSchema),

    // Users
    AppUserResponse: toJsonSchema(AppUserResponseSchema),
    CreateAppUserInput: toJsonSchema(CreateAppUserInputSchema),
    UpdateAppUserInput: toJsonSchema(UpdateAppUserInputSchema),
    ListAppUsersQuery: toJsonSchema(ListAppUsersQuerySchema),
    PaginatedAppUsersResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/AppUserResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },

    // Roles & Assignments
    RoleResponse: toJsonSchema(RoleResponseSchema),
    AssignmentResponse: toJsonSchema(AssignmentResponseSchema),
    CreateAssignmentInput: toJsonSchema(CreateAssignmentInputSchema),
    ListAssignmentsQuery: toJsonSchema(ListAssignmentsQuerySchema),
    AssignmentListResponse: {
      type: 'array',
      items: { $ref: '#/components/schemas/AssignmentResponse' },
    },

    // Organisations
    OrganisationResponse: toJsonSchema(OrganisationResponseSchema),
    CreateOrganisationInput: toJsonSchema(CreateOrganisationInputSchema),
    UpdateOrganisationInput: toJsonSchema(UpdateOrganisationInputSchema),
    ListOrganisationsQuery: toJsonSchema(ListOrganisationsQuerySchema),
    PaginatedOrganisationsResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/OrganisationResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },

    // WUAs & Officers
    WuaResponse: toJsonSchema(WuaResponseSchema),
    CreateWuaInput: toJsonSchema(CreateWuaInputSchema),
    UpdateWuaInput: toJsonSchema(UpdateWuaInputSchema),
    ListWuasQuery: toJsonSchema(ListWuasQuerySchema),
    PaginatedWuasResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/WuaResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },
    WuaOfficerResponse: toJsonSchema(WuaOfficerResponseSchema),
    CreateWuaOfficerInput: toJsonSchema(CreateWuaOfficerInputSchema),
    UpdateWuaOfficerInput: toJsonSchema(UpdateWuaOfficerInputSchema),
    ListWuaOfficersQuery: toJsonSchema(ListWuaOfficersQuerySchema),

    // Geography
    StateResponse: toJsonSchema(StateResponseSchema),
    ListStatesQuery: toJsonSchema(ListStatesQuerySchema),
    PaginatedStatesResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/StateResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },
    LgaResponse: toJsonSchema(LgaResponseSchema),
    ListLgasQuery: toJsonSchema(ListLgasQuerySchema),
    PaginatedLgasResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/LgaResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },
    WardResponse: toJsonSchema(WardResponseSchema),
    ListWardsQuery: toJsonSchema(ListWardsQuerySchema),
    PaginatedWardsResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/WardResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },

    // Lookups
    LookupTypeResponse: toJsonSchema(LookupTypeResponseSchema),
    CreateLookupTypeInput: toJsonSchema(CreateLookupTypeInputSchema),
    ListLookupTypesQuery: toJsonSchema(ListLookupTypesQuerySchema),
    PaginatedLookupTypesResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/LookupTypeResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },
    LookupValueResponse: toJsonSchema(LookupValueResponseSchema),
    CreateLookupValueInput: toJsonSchema(CreateLookupValueInputSchema),
    UpdateLookupValueInput: toJsonSchema(UpdateLookupValueInputSchema),
    ListLookupValuesQuery: toJsonSchema(ListLookupValuesQuerySchema),
    PaginatedLookupValuesResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/LookupValueResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },

    // Settings
    SettingResponse: toJsonSchema(SettingResponseSchema),
    SetSettingInput: toJsonSchema(SetSettingInputSchema),
    ListSettingsQuery: toJsonSchema(ListSettingsQuerySchema),
    PaginatedSettingsResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/SettingResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },

    // Files
    FileResponse: toJsonSchema(FileResponseSchema),
    InitiateUploadInput: toJsonSchema(InitiateUploadInputSchema),
    InitiateUploadResponse: toJsonSchema(InitiateUploadResponseSchema),
    CompleteUploadInput: toJsonSchema(CompleteUploadInputSchema),
    CompleteUploadResponse: toJsonSchema(CompleteUploadResponseSchema),
    FileDownloadUrlResponse: toJsonSchema(FileDownloadUrlResponseSchema),
    ListFilesQuery: toJsonSchema(ListFilesQuerySchema),

    // Imports
    ImportBatchResponse: toJsonSchema(ImportBatchResponseSchema),
    InitiateImportInput: toJsonSchema(InitiateImportInputSchema),
    ListImportBatchesQuery: toJsonSchema(ListImportBatchesQuerySchema),
    PaginatedImportBatchesResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/ImportBatchResponse' } },
        nextCursor: { type: 'string', nullable: true },
      },
      required: ['items'],
    },
    ImportPreviewResponse: toJsonSchema(ImportPreviewResponseSchema),
    ImportSseTokenResponse: toJsonSchema(ImportSseTokenResponseSchema),
    ImportProgressMessage: toJsonSchema(ImportProgressMessageSchema),

    // Audit
    AuditLogResponse: toJsonSchema(AuditLogResponseSchema),
    ListAuditLogsQuery: toJsonSchema(ListAuditLogsQuerySchema),
    PaginatedAuditLogsResponse: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/AuditLogResponse' } },
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
      },
      required: ['items', 'total', 'page', 'limit'],
    },

    // Outbox
    ListDeadEventsResponse: toJsonSchema(ListDeadEventsResponseSchema),
    RequeueEventResponse: toJsonSchema(RequeueEventResponseSchema),

    // SLIS
    ...slisSchemas,
  };

  const isDevOrTest = process.env.NODE_ENV !== 'production';

  const paths: Record<string, Record<string, unknown>> = {
    // -------------------------------------------------------------
    // HEALTH
    // -------------------------------------------------------------
    '/health': {
      get: {
        summary: 'Service health check',
        tags: ['health'],
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
                  required: ['status'],
                },
              },
            },
          },
        },
      },
    },

    // -------------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------------
    '/auth/sign-in': {
      post: {
        summary: 'User sign in with credentials',
        tags: ['auth'],
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
            description: 'Authentication result or next-factor prompt',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignInResponse' },
              },
            },
          },
          ...errors([400, 401, 429]),
        },
      },
    },
    '/auth/totp/setup': {
      post: {
        summary: 'Initiate TOTP authenticator setup',
        tags: ['auth'],
        security: SECURED,
        description: 'Generates TOTP secret, otpauth URI, and emergency recovery codes',
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
            description: 'TOTP setup payload with recovery codes',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TotpSetupResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
    },
    '/auth/totp/verify': {
      post: {
        summary: 'Verify TOTP code or recovery code',
        tags: ['auth'],
        security: SECURED,
        description: 'Completes 2FA challenge and issues session tokens',
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
            description: 'Authentication tokens or password change requirement',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignInResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate refresh token and issue new access token',
        tags: ['auth'],
        description: 'Refreshes session using HTTP-only cookie',
        responses: {
          '200': {
            description: 'New access token and session metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RefreshTokenResponse' },
              },
            },
          },
          ...errors([401]),
        },
      },
    },
    '/auth/sign-out': {
      post: {
        summary: 'Sign out and revoke active session',
        tags: ['auth'],
        security: SECURED,
        description: 'Revokes the current refresh token and clears session cookie',
        responses: {
          '200': {
            description: 'Sign out confirmation',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SignOutResponse' },
              },
            },
          },
          ...errors([401]),
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get current user profile and session identity',
        tags: ['auth'],
        security: SECURED,
        description: 'Returns profile details, active roles, and scope boundaries for current user',
        responses: {
          '200': {
            description: 'Current user identity and scope',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthMeResponse' },
              },
            },
          },
          ...errors([401]),
        },
      },
    },
    '/auth/me/abilities': {
      get: {
        summary: 'Get current user abilities and permission map',
        tags: ['auth'],
        security: SECURED,
        description: 'Returns effective permissions and module scopes for frontend authorization',
        responses: {
          '200': {
            description: 'Effective permission map',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserAbilitiesResponse' },
              },
            },
          },
          ...errors([401]),
        },
      },
    },
    '/auth/change-password': {
      post: {
        summary: 'Change password for authenticated user',
        tags: ['auth'],
        security: SECURED,
        description: 'Validates current password and updates to new password',
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
          ...errors([400, 401]),
        },
      },
    },
    '/auth/reset-password': {
      post: {
        summary: 'Admin reset password for user',
        tags: ['auth'],
        security: SECURED,
        description: 'Generates a temporary password and forces password change on next sign-in',
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
          ...errors([400, 401, 403, 404]),
        },
      },
    },

    // -------------------------------------------------------------
    // USERS (ADMIN)
    // -------------------------------------------------------------
    '/admin/users': {
      get: {
        summary: 'List application users',
        tags: ['users'],
        security: SECURED,
        description: 'Returns paginated users filtered by role and active status',
        responses: {
          '200': {
            description: 'Paginated user list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedAppUsersResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
      post: {
        summary: 'Create application user',
        tags: ['users'],
        security: SECURED,
        description: 'Creates a new user and optional initial role assignment',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateAppUserInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AppUserResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 409]),
        },
      },
    },
    '/admin/users/{id}': {
      get: {
        summary: 'Get application user by ID',
        tags: ['users'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'User details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AppUserResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
      patch: {
        summary: 'Update application user',
        tags: ['users'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateAppUserInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated user details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AppUserResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404, 409]),
        },
      },
      delete: {
        summary: 'Deactivate application user',
        tags: ['users'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Deactivated user details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AppUserResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },

    // -------------------------------------------------------------
    // ASSIGNMENTS (ADMIN)
    // -------------------------------------------------------------
    '/admin/assignments': {
      post: {
        summary: 'Create role assignment for user',
        tags: ['assignments'],
        security: SECURED,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateAssignmentInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created assignment',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssignmentResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 409]),
        },
      },
    },
    '/admin/assignments/users/{userId}': {
      get: {
        summary: 'List role assignments for user',
        tags: ['assignments'],
        security: SECURED,
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'List of user role assignments',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssignmentListResponse' },
              },
            },
          },
          ...errors([401, 403]),
        },
      },
    },
    '/admin/assignments/{id}': {
      delete: {
        summary: 'Revoke role assignment',
        tags: ['assignments'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Revoked assignment',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssignmentResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },

    // -------------------------------------------------------------
    // ORGANISATIONS (ADMIN)
    // -------------------------------------------------------------
    '/admin/organisations': {
      get: {
        summary: 'List organisations',
        tags: ['organisations'],
        security: SECURED,
        description: 'Returns paginated organisation entities filtered by type and state',
        responses: {
          '200': {
            description: 'Paginated organisation list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedOrganisationsResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
      post: {
        summary: 'Create organisation',
        tags: ['organisations'],
        security: SECURED,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateOrganisationInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Organisation created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OrganisationResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 409]),
        },
      },
    },
    '/admin/organisations/{id}': {
      get: {
        summary: 'Get organisation by ID',
        tags: ['organisations'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Organisation details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OrganisationResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
      patch: {
        summary: 'Update organisation',
        tags: ['organisations'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateOrganisationInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated organisation details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/OrganisationResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404, 409]),
        },
      },
    },

    // -------------------------------------------------------------
    // WUAS & OFFICERS
    // -------------------------------------------------------------
    '/wuas': {
      get: {
        summary: 'List water user associations (WUAs)',
        tags: ['wuas'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Paginated WUA list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedWuasResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
      post: {
        summary: 'Create water user association (WUA)',
        tags: ['wuas'],
        security: SECURED,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateWuaInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'WUA created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WuaResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 409]),
        },
      },
    },
    '/wuas/{id}': {
      get: {
        summary: 'Get WUA by ID',
        tags: ['wuas'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'WUA details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WuaResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
      patch: {
        summary: 'Update WUA',
        tags: ['wuas'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateWuaInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated WUA details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WuaResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404, 409]),
        },
      },
    },
    '/wuas/{id}/officers': {
      post: {
        summary: 'Create officer for WUA',
        tags: ['wuas'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateWuaOfficerInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created WUA officer',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WuaOfficerResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404]),
        },
      },
    },
    '/wuas/{id}/officers/{officerId}': {
      delete: {
        summary: 'Remove officer from WUA',
        tags: ['wuas'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          {
            name: 'officerId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Removed WUA officer',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WuaOfficerResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },

    // -------------------------------------------------------------
    // GEOGRAPHY
    // -------------------------------------------------------------
    '/geography/states': {
      get: {
        summary: 'List administrative states',
        tags: ['geography'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Paginated state list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedStatesResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
    },
    '/geography/lgas': {
      get: {
        summary: 'List local government areas (LGAs)',
        tags: ['geography'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Paginated LGA list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedLgasResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
    },
    '/geography/wards': {
      get: {
        summary: 'List administrative wards',
        tags: ['geography'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Paginated ward list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedWardsResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
    },

    // -------------------------------------------------------------
    // LOOKUPS (ADMIN)
    // -------------------------------------------------------------
    '/admin/lookups/types': {
      get: {
        summary: 'List lookup types',
        tags: ['lookups'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Paginated lookup types list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedLookupTypesResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
      post: {
        summary: 'Create lookup type',
        tags: ['lookups'],
        security: SECURED,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateLookupTypeInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created lookup type',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LookupTypeResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 409]),
        },
      },
    },
    '/admin/lookups/values': {
      get: {
        summary: 'List lookup values',
        tags: ['lookups'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Paginated lookup values list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedLookupValuesResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
      post: {
        summary: 'Create lookup value',
        tags: ['lookups'],
        security: SECURED,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateLookupValueInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created lookup value',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LookupValueResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 409]),
        },
      },
    },
    '/admin/lookups/values/{id}': {
      patch: {
        summary: 'Update lookup value',
        tags: ['lookups'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateLookupValueInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated lookup value',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LookupValueResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404, 409]),
        },
      },
    },

    // -------------------------------------------------------------
    // SETTINGS (ADMIN)
    // -------------------------------------------------------------
    '/admin/settings': {
      get: {
        summary: 'List system settings',
        tags: ['settings'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Paginated settings list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedSettingsResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
    },
    '/admin/settings/{key}': {
      patch: {
        summary: 'Update system setting by key',
        tags: ['settings'],
        security: SECURED,
        parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SetSettingInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated setting details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SettingResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404]),
        },
      },
    },

    // -------------------------------------------------------------
    // FILES
    // -------------------------------------------------------------
    '/files/upload/initiate': {
      post: {
        summary: 'Initiate file upload session',
        tags: ['files'],
        security: SECURED,
        description: 'Generates presigned upload URL or multipart part URLs for S3/MinIO',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InitiateUploadInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Presigned upload instructions',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/InitiateUploadResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
    },
    '/files/upload/complete': {
      post: {
        summary: 'Complete file upload and verify integrity',
        tags: ['files'],
        security: SECURED,
        description: 'Validates uploaded object size, magic bytes, and registers file record',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CompleteUploadInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Verified file record',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CompleteUploadResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404, 422]),
        },
      },
    },
    '/files/{id}/download': {
      get: {
        summary: 'Get presigned download URL for file',
        tags: ['files'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Presigned download URL',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FileDownloadUrlResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },
    '/files/{id}': {
      get: {
        summary: 'Get file metadata by ID',
        tags: ['files'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'File metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FileResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
      delete: {
        summary: 'Delete file and storage object',
        tags: ['files'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Deleted file record',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FileResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },

    // -------------------------------------------------------------
    // IMPORTS
    // -------------------------------------------------------------
    '/imports/template/{dataset}': {
      get: {
        summary: 'Download template for import dataset',
        tags: ['imports'],
        security: SECURED,
        parameters: [
          {
            name: 'dataset',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: [
                'wua',
                'slis.farmer',
                'slis.plot',
                'slis.fee_billing',
                'slis.fee_collection',
                'slis.water_request',
                'slis.training',
                'slis.crop_production',
              ],
            },
          },
        ],
        responses: {
          '200': {
            description: 'XLSX template workbook with Data and Instructions sheets',
            content: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          ...errors([400, 401, 403, 404]),
        },
      },
    },
    '/imports': {
      get: {
        summary: 'List import batches',
        tags: ['imports'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Paginated import batches list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedImportBatchesResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
      post: {
        summary: 'Initiate batch import from uploaded file',
        tags: ['imports'],
        security: SECURED,
        description: 'Enqueues background import job for validation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InitiateImportInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Import batch queued for validation',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImportBatchResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404]),
        },
      },
    },
    '/imports/{batchId}': {
      get: {
        summary: 'Get import batch status and summary',
        tags: ['imports'],
        security: SECURED,
        parameters: [
          {
            name: 'batchId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Import batch details and row counts',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImportBatchResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },
    '/imports/{batchId}/preview': {
      get: {
        summary: 'Preview validated rows and errors for import batch',
        tags: ['imports'],
        security: SECURED,
        parameters: [
          {
            name: 'batchId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Import batch row-level preview and error details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImportPreviewResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },
    '/imports/{batchId}/commit': {
      post: {
        summary: 'Commit valid import batch rows',
        tags: ['imports'],
        security: SECURED,
        parameters: [
          {
            name: 'batchId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Commit initiated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImportBatchResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404, 409]),
        },
      },
    },
    '/imports/{batchId}/undo': {
      post: {
        summary: 'Undo previously committed import batch',
        tags: ['imports'],
        security: SECURED,
        parameters: [
          {
            name: 'batchId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Undo initiated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImportBatchResponse' },
              },
            },
          },
          ...errors([400, 401, 403, 404, 409]),
        },
      },
    },
    '/imports/{batchId}/token': {
      post: {
        summary: 'Issue SSE ticket token for import progress streaming',
        tags: ['imports'],
        security: SECURED,
        parameters: [
          {
            name: 'batchId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Short-lived single-use SSE ticket token',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImportSseTokenResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },
    '/imports/{batchId}/progress': {
      get: {
        summary: 'Stream import batch progress via Server-Sent Events',
        tags: ['imports'],
        parameters: [
          {
            name: 'batchId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'sseToken', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Server-Sent Events event stream',
            content: {
              'text/event-stream': {
                schema: { $ref: '#/components/schemas/ImportProgressMessage' },
              },
            },
          },
          ...errors([401, 404]),
        },
      },
    },

    // -------------------------------------------------------------
    // AUDIT LOGS (ADMIN)
    // -------------------------------------------------------------
    '/admin/audit-logs': {
      get: {
        summary: 'List and filter audit trail logs',
        tags: ['audit'],
        security: SECURED,
        description: 'Read append-only immutable audit trail with actor, action, diff, and scope',
        responses: {
          '200': {
            description: 'Paginated audit trail records',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PaginatedAuditLogsResponse' },
              },
            },
          },
          ...errors([400, 401, 403]),
        },
      },
    },

    // -------------------------------------------------------------
    // OUTBOX (ADMIN)
    // -------------------------------------------------------------
    '/admin/outbox/dead': {
      get: {
        summary: 'List dead outbox events exceeding max retries',
        tags: ['outbox'],
        security: SECURED,
        responses: {
          '200': {
            description: 'Dead event list and total count',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ListDeadEventsResponse' },
              },
            },
          },
          ...errors([401, 403]),
        },
      },
    },
    '/admin/outbox/{id}/requeue': {
      post: {
        summary: 'Requeue dead outbox event for processing',
        tags: ['outbox'],
        security: SECURED,
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Requeue confirmation and next availability timestamp',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RequeueEventResponse' },
              },
            },
          },
          ...errors([401, 403, 404]),
        },
      },
    },
  };

  if (isDevOrTest) {
    schemas.SampleEchoInput = toJsonSchema(SampleEchoInputSchema);
    schemas.SampleEchoResponse = toJsonSchema(SampleEchoResponseSchema);

    paths['/sample/echo'] = {
      post: {
        summary: 'Sample Echo Endpoint',
        tags: ['health'],
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
          ...errors([400, 409]),
        },
      },
    };

    paths['/sample/conflict-test'] = {
      get: {
        summary: 'Sample 409 Conflict Test',
        tags: ['health'],
        description: 'Demonstrates 409 Conflict Problem response',
        responses: {
          ...errors([409]),
        },
      },
    };
  }

  // SLIS endpoints
  Object.assign(paths, slisPaths);

  const tags = [
    { name: 'auth', description: 'Authentication, TOTP MFA, sessions, and passwords' },
    { name: 'users', description: 'User account provisioning, profiles, and status' },
    { name: 'assignments', description: 'Role and geographic/organisational scope assignments' },
    { name: 'organisations', description: 'RBDAs, schemes, sectors, and offices' },
    { name: 'wuas', description: 'Water User Associations and governance officers' },
    { name: 'geography', description: 'States, LGAs, and Wards' },
    { name: 'lookups', description: 'Configurable lookup types and coded values' },
    { name: 'settings', description: 'System-wide configuration parameters' },
    { name: 'files', description: 'Presigned S3/MinIO upload, validation, and download' },
    { name: 'imports', description: 'Batch dataset import engine, validation, and SSE streaming' },
    { name: 'audit', description: 'Immutable RFC-compliant audit trail logs' },
    { name: 'outbox', description: 'Dead letter queue monitoring and event requeue' },
    { name: 'health', description: 'Liveness and service readiness checks' },
    {
      name: 'slis',
      description: 'Scheme Land Information System (farmers, plots, operations, sync)',
    },
    {
      name: 'slis-reports',
      description: 'Scheme Land Information System aggregated reports and materialized views',
    },
    {
      name: 'slis-exports',
      description: 'Scheme Land Information System asynchronous tabular export processing',
    },
  ];

  return {
    openapi: '3.1.0',
    info: {
      title: 'TRIMING IDMIS 2.0 API',
      version: '0.1.0',
      description: 'TRIMING Irrigation Data Management Information System API',
    },
    servers: [
      {
        url: basePath,
        description: 'API base path',
      },
    ],
    tags,
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter the JWT accessToken obtained from POST /auth/sign-in',
        },
      },
    },
  };
}
