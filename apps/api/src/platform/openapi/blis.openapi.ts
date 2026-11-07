import { z } from 'zod';
import {
  BasinSchema,
  CreateBasinInputSchema,
  UpdateBasinInputSchema,
  BasinMorphometrySchema,
  CreateBasinMorphometryInputSchema,
  UpdateBasinMorphometryInputSchema,
  StationSchema,
  CreateStationInputSchema,
  UpdateStationInputSchema,
  ReservoirSchema,
  CreateReservoirInputSchema,
  UpdateReservoirInputSchema,
  DamSchema,
  CreateDamInputSchema,
  UpdateDamInputSchema,
  RawReadingsResponseSchema,
  AggregatedReadingsResponseSchema,
} from '@idmis/contracts';

function toJsonSchema(schema: z.ZodTypeAny) {
  return z.toJSONSchema(schema, {
    unrepresentable: () => ({ type: 'string', format: 'date-time' }),
  });
}

const SECURED = [{ bearerAuth: [] }];

function standardErrorResponses(...codes: number[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const code of codes) {
    let description = 'Error response';
    const schemaRef =
      code === 409 ? '#/components/schemas/ConflictProblem' : '#/components/schemas/ProblemDetails';
    switch (code) {
      case 400:
        description = 'Bad Request - validation or schema constraint failure';
        break;
      case 401:
        description = 'Unauthorized - missing or invalid access token';
        break;
      case 403:
        description = 'Forbidden - insufficient permissions or out of scope';
        break;
      case 404:
        description = 'Not Found - entity not found or inaccessible';
        break;
      case 409:
        description = 'Conflict - optimistic concurrency version mismatch';
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

export const blisSchemas: Record<string, unknown> = {
  Basin: toJsonSchema(BasinSchema),
  CreateBasinInput: toJsonSchema(CreateBasinInputSchema),
  UpdateBasinInput: toJsonSchema(UpdateBasinInputSchema),
  BasinMorphometry: toJsonSchema(BasinMorphometrySchema),
  CreateBasinMorphometryInput: toJsonSchema(CreateBasinMorphometryInputSchema),
  UpdateBasinMorphometryInput: toJsonSchema(UpdateBasinMorphometryInputSchema),
  Station: toJsonSchema(StationSchema),
  CreateStationInput: toJsonSchema(CreateStationInputSchema),
  UpdateStationInput: toJsonSchema(UpdateStationInputSchema),
  Reservoir: toJsonSchema(ReservoirSchema),
  CreateReservoirInput: toJsonSchema(CreateReservoirInputSchema),
  UpdateReservoirInput: toJsonSchema(UpdateReservoirInputSchema),
  Dam: toJsonSchema(DamSchema),
  CreateDamInput: toJsonSchema(CreateDamInputSchema),
  UpdateDamInput: toJsonSchema(UpdateDamInputSchema),
  RawReadingsResponse: toJsonSchema(RawReadingsResponseSchema),
  AggregatedReadingsResponse: toJsonSchema(AggregatedReadingsResponseSchema),
};

export const blisPaths: Record<string, Record<string, unknown>> = {
  // -------------------------------------------------------------
  // BASINS
  // -------------------------------------------------------------
  '/blis/basins': {
    get: {
      summary: 'List river basins',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        {
          name: 'rbdaId',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
      ],
      responses: {
        '200': {
          description: 'Paginated list of river basins',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Basin' },
                  },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create river basin',
      tags: ['blis'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateBasinInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Basin created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Basin' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/blis/basins/{id}': {
    get: {
      summary: 'Get basin by ID',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Basin details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Basin' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update basin',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateBasinInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Basin updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Basin' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete basin (soft delete)',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'version', in: 'query', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Basin deleted successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean' } },
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },

  // -------------------------------------------------------------
  // BASIN MORPHOMETRY
  // -------------------------------------------------------------
  '/blis/basin-morphometry': {
    get: {
      summary: 'List basin morphometry records',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        {
          name: 'basinId',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
      ],
      responses: {
        '200': {
          description: 'Paginated list of basin morphometry records',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/BasinMorphometry' },
                  },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create basin morphometry record',
      tags: ['blis'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateBasinMorphometryInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Morphometry record created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BasinMorphometry' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/blis/basin-morphometry/{id}': {
    get: {
      summary: 'Get basin morphometry record by ID',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Morphometry record details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BasinMorphometry' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update basin morphometry record',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateBasinMorphometryInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Morphometry record updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BasinMorphometry' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete basin morphometry record (soft delete)',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'version', in: 'query', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Morphometry record deleted successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean' } },
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },

  // -------------------------------------------------------------
  // STATIONS
  // -------------------------------------------------------------
  '/blis/stations': {
    get: {
      summary: 'List monitoring stations',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        {
          name: 'basinId',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        {
          name: 'stationTypeId',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
      ],
      responses: {
        '200': {
          description: 'Paginated list of monitoring stations',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Station' },
                  },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create monitoring station',
      tags: ['blis'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateStationInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Station created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Station' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/blis/stations/{id}': {
    get: {
      summary: 'Get station by ID',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Station details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Station' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update station',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateStationInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Station updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Station' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete station (soft delete)',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'version', in: 'query', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Station deleted successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean' } },
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },

  '/blis/stations/{id}/readings': {
    get: {
      summary: 'Get station time-series readings',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'parameter', in: 'query', required: true, schema: { type: 'string' } },
        {
          name: 'from',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
        },
        {
          name: 'to',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
        },
        {
          name: 'interval',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['raw', 'day', 'month', 'year'], default: 'raw' },
        },
        {
          name: 'quality',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['raw', 'checked', 'suspect'] },
        },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 100 } },
        { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Station readings (raw or aggregated)',
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/RawReadingsResponse' },
                  { $ref: '#/components/schemas/AggregatedReadingsResponse' },
                ],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404),
      },
    },
  },

  // -------------------------------------------------------------
  // RESERVOIRS
  // -------------------------------------------------------------
  '/blis/reservoirs': {
    get: {
      summary: 'List reservoirs',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        {
          name: 'basinId',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
      ],
      responses: {
        '200': {
          description: 'Paginated list of reservoirs',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Reservoir' },
                  },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create reservoir',
      tags: ['blis'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateReservoirInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Reservoir created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Reservoir' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/blis/reservoirs/{id}': {
    get: {
      summary: 'Get reservoir by ID',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Reservoir details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Reservoir' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update reservoir',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateReservoirInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Reservoir updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Reservoir' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete reservoir (soft delete)',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'version', in: 'query', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Reservoir deleted successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean' } },
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },

  // -------------------------------------------------------------
  // DAMS
  // -------------------------------------------------------------
  '/blis/dams': {
    get: {
      summary: 'List dams',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        {
          name: 'basinId',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        {
          name: 'reservoirId',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
      ],
      responses: {
        '200': {
          description: 'Paginated list of dams',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Dam' },
                  },
                  total: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create dam',
      tags: ['blis'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateDamInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Dam created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Dam' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/blis/dams/{id}': {
    get: {
      summary: 'Get dam by ID',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Dam details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Dam' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update dam',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateDamInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Dam updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Dam' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete dam (soft delete)',
      tags: ['blis'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'version', in: 'query', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Dam deleted successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean' } },
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },
};
