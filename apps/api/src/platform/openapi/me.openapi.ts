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
  SurveySchema,
  CreateSurveyInputSchema,
  UpdateSurveyInputSchema,
  SurveyQuestionSchema,
  CreateSurveyQuestionInputSchema,
  UpdateSurveyQuestionInputSchema,
  SurveyResponseSchema,
  CreateSurveyResponseInputSchema,
  ScorecardSchema,
  CreateScorecardInputSchema,
  UpdateScorecardInputSchema,
  MatchingGrantSchema,
  CreateMatchingGrantInputSchema,
  UpdateMatchingGrantInputSchema,
  TechAdoptionSchema,
  CreateTechAdoptionInputSchema,
  UpdateTechAdoptionInputSchema,
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
  SurveyResponse: toJsonSchema(SurveySchema),
  CreateSurveyInput: toJsonSchema(CreateSurveyInputSchema),
  UpdateSurveyInput: toJsonSchema(UpdateSurveyInputSchema),
  SurveyQuestionResponse: toJsonSchema(SurveyQuestionSchema),
  CreateSurveyQuestionInput: toJsonSchema(CreateSurveyQuestionInputSchema),
  UpdateSurveyQuestionInput: toJsonSchema(UpdateSurveyQuestionInputSchema),
  SurveyResponseItem: toJsonSchema(SurveyResponseSchema),
  CreateSurveyResponseInput: toJsonSchema(CreateSurveyResponseInputSchema),
  ScorecardResponse: toJsonSchema(ScorecardSchema),
  CreateScorecardInput: toJsonSchema(CreateScorecardInputSchema),
  UpdateScorecardInput: toJsonSchema(UpdateScorecardInputSchema),
  MatchingGrantResponse: toJsonSchema(MatchingGrantSchema),
  CreateMatchingGrantInput: toJsonSchema(CreateMatchingGrantInputSchema),
  UpdateMatchingGrantInput: toJsonSchema(UpdateMatchingGrantInputSchema),
  TechAdoptionResponse: toJsonSchema(TechAdoptionSchema),
  CreateTechAdoptionInput: toJsonSchema(CreateTechAdoptionInputSchema),
  UpdateTechAdoptionInput: toJsonSchema(UpdateTechAdoptionInputSchema),
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

  // -------------------------------------------------------------
  // SURVEYS & QUESTIONS (BE-3.4)
  // -------------------------------------------------------------
  '/me/surveys': {
    get: {
      summary: 'List surveys',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'schemeId', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'offset', in: 'query', schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'List of surveys',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { $ref: '#/components/schemas/SurveyResponse' } },
                  total: { type: 'integer' },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create a new survey',
      tags: ['me'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateSurveyInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Survey created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SurveyResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/me/surveys/responses/{responseId}': {
    get: {
      summary: 'Get survey response by id',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'responseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Survey response details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SurveyResponseItem' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    delete: {
      summary: 'Delete survey response',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'responseId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Survey response deleted successfully',
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

  '/me/surveys/{id}': {
    get: {
      summary: 'Get survey details',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Survey details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SurveyResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update survey',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateSurveyInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Survey updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SurveyResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/me/surveys/{id}/version': {
    post: {
      summary: 'Create a new version of survey',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '201': {
          description: 'New survey version created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SurveyResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
  },

  '/me/surveys/{id}/questions': {
    post: {
      summary: 'Add question to survey',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateSurveyQuestionInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Question added successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SurveyQuestionResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/me/surveys/{id}/questions/{questionId}': {
    put: {
      summary: 'Update survey question',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'questionId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateSurveyQuestionInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Question updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SurveyQuestionResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete survey question',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'questionId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Question deleted successfully',
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },

  '/me/surveys/{id}/responses': {
    get: {
      summary: 'List survey responses',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'schemeId', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'offset', in: 'query', schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'List of survey responses',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SurveyResponseItem' },
                  },
                  total: { type: 'integer' },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404),
      },
    },
    post: {
      summary: 'Submit survey response',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateSurveyResponseInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Survey response submitted successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SurveyResponseItem' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404),
      },
    },
  },

  // -------------------------------------------------------------
  // SCORECARDS
  // -------------------------------------------------------------
  '/me/scorecards': {
    get: {
      summary: 'List scorecards',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'schemeId', in: 'query', schema: { type: 'string' } },
        { name: 'periodYear', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'cursor', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'List of scorecards',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ScorecardResponse' },
                  },
                  total: { type: 'integer' },
                  nextCursor: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create scorecard',
      tags: ['me'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateScorecardInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Scorecard created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ScorecardResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/me/scorecards/{id}': {
    get: {
      summary: 'Get scorecard by ID',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Scorecard details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ScorecardResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update scorecard',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateScorecardInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Scorecard updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ScorecardResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete scorecard',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'version', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Scorecard deleted successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ScorecardResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },

  // -------------------------------------------------------------
  // MATCHING GRANTS
  // -------------------------------------------------------------
  '/me/grants': {
    get: {
      summary: 'List matching grants',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'schemeId', in: 'query', schema: { type: 'string' } },
        { name: 'wuaId', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'cursor', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'List of matching grants',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/MatchingGrantResponse' },
                  },
                  total: { type: 'integer' },
                  nextCursor: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create matching grant',
      tags: ['me'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateMatchingGrantInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Matching grant created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MatchingGrantResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/me/grants/{id}': {
    get: {
      summary: 'Get matching grant by ID',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Matching grant details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MatchingGrantResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update matching grant',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateMatchingGrantInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Matching grant updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MatchingGrantResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete matching grant',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'version', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Matching grant deleted successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MatchingGrantResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },

  // -------------------------------------------------------------
  // TECHNOLOGY ADOPTION
  // -------------------------------------------------------------
  '/me/tech-adoption': {
    get: {
      summary: 'List tech adoptions',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'schemeId', in: 'query', schema: { type: 'string' } },
        { name: 'technologyId', in: 'query', schema: { type: 'string' } },
        { name: 'gender', in: 'query', schema: { type: 'string', enum: ['female', 'male'] } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'cursor', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'List of tech adoptions',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/TechAdoptionResponse' },
                  },
                  total: { type: 'integer' },
                  nextCursor: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create tech adoption record',
      tags: ['me'],
      security: SECURED,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateTechAdoptionInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Tech adoption created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TechAdoptionResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/me/tech-adoption/{id}': {
    get: {
      summary: 'Get tech adoption record by ID',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Tech adoption record details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TechAdoptionResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    put: {
      summary: 'Update tech adoption record',
      tags: ['me'],
      security: SECURED,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateTechAdoptionInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Tech adoption record updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TechAdoptionResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
    delete: {
      summary: 'Delete tech adoption record',
      tags: ['me'],
      security: SECURED,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'version', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'Tech adoption record deleted successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TechAdoptionResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404, 409),
      },
    },
  },
};
