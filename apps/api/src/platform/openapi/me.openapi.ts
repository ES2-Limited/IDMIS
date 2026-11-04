import { z } from 'zod';
import {
  IndicatorSchema,
  IndicatorTargetSchema,
  CreateIndicatorTargetInputSchema,
  UpdateIndicatorTargetInputSchema,
  IndicatorValueSchema,
  CreateIndicatorValueInputSchema,
  UpdateIndicatorValueInputSchema,
  SubmitIndicatorValueInputSchema,
  ApproveIndicatorValueInputSchema,
  ReturnIndicatorValueInputSchema,
  AttachEvidenceInputSchema,
  IndicatorValueEvidenceSchema,
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
        description = 'Not Found - entity does not exist or outside scope';
        break;
      case 409:
        description = 'Conflict - optimistic concurrency failure or duplicate slot';
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

export const meSchemas: Record<string, unknown> = {
  IndicatorResponse: toJsonSchema(IndicatorSchema),
  IndicatorTargetResponse: toJsonSchema(IndicatorTargetSchema),
  CreateIndicatorTargetInput: toJsonSchema(CreateIndicatorTargetInputSchema),
  UpdateIndicatorTargetInput: toJsonSchema(UpdateIndicatorTargetInputSchema),
  IndicatorValueResponse: toJsonSchema(IndicatorValueSchema),
  CreateIndicatorValueInput: toJsonSchema(CreateIndicatorValueInputSchema),
  UpdateIndicatorValueInput: toJsonSchema(UpdateIndicatorValueInputSchema),
  SubmitIndicatorValueInput: toJsonSchema(SubmitIndicatorValueInputSchema),
  ApproveIndicatorValueInput: toJsonSchema(ApproveIndicatorValueInputSchema),
  ReturnIndicatorValueInput: toJsonSchema(ReturnIndicatorValueInputSchema),
  AttachEvidenceInput: toJsonSchema(AttachEvidenceInputSchema),
  IndicatorValueEvidenceResponse: toJsonSchema(IndicatorValueEvidenceSchema),
};

export const mePaths: Record<string, Record<string, unknown>> = {
  // -------------------------------------------------------------
  // INDICATORS
  // -------------------------------------------------------------
  '/me/indicators': {
    get: {
      summary: 'List results framework indicators',
      tags: ['me'],
      security: SECURED,
      responses: {
        '200': {
          description: 'List of indicators',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/IndicatorResponse' },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/me/indicators/{id}': {
    get: {
      summary: 'Get indicator details by ID',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Indicator record',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
  },

  // -------------------------------------------------------------
  // INDICATOR TARGETS
  // -------------------------------------------------------------
  '/me/targets': {
    get: {
      summary: 'List indicator targets within scope',
      tags: ['me'],
      security: SECURED,
      responses: {
        '200': {
          description: 'List of indicator targets',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/IndicatorTargetResponse' },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create an indicator target for a slot',
      tags: ['me'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateIndicatorTargetInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Indicator target created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorTargetResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/me/targets/{id}': {
    get: {
      summary: 'Get indicator target by ID',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Indicator target details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorTargetResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update indicator target value',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateIndicatorTargetInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Target updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorTargetResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Soft-delete indicator target',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Target soft-deleted successfully',
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
  },

  // -------------------------------------------------------------
  // INDICATOR VALUES & WORKFLOW
  // -------------------------------------------------------------
  '/me/values': {
    get: {
      summary: 'List indicator values within scope',
      tags: ['me'],
      security: SECURED,
      responses: {
        '200': {
          description: 'List of indicator values',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/IndicatorValueResponse' },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create a new indicator value (manual indicators only)',
      tags: ['me'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateIndicatorValueInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Indicator value created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorValueResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/me/values/{id}': {
    get: {
      summary: 'Get indicator value by ID',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Indicator value details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorValueResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update indicator value (resets approved value to submitted)',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateIndicatorValueInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Indicator value updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorValueResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/me/values/{id}/submit': {
    post: {
      summary: 'Submit a draft or returned indicator value for review',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SubmitIndicatorValueInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Indicator value submitted successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorValueResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/me/values/{id}/approve': {
    post: {
      summary: 'Approve a submitted indicator value (no self-approval)',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApproveIndicatorValueInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Indicator value approved successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorValueResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/me/values/{id}/return': {
    post: {
      summary: 'Return a submitted indicator value with required comment',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ReturnIndicatorValueInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Indicator value returned successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorValueResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/me/values/{id}/evidence': {
    get: {
      summary: 'List evidence files attached to an indicator value',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Attached evidence files',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { type: 'object' },
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    post: {
      summary: 'Attach a file as evidence for an indicator value',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AttachEvidenceInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Evidence attached successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/IndicatorValueEvidenceResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404),
      },
    },
  },

  '/me/values/{id}/evidence/{fileId}': {
    delete: {
      summary: 'Remove an attached evidence file from an indicator value',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Evidence removed successfully',
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
  },
};
