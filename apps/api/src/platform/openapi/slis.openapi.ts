import { z } from 'zod';
import {
  FarmerResponseSchema,
  CreateFarmerInputSchema,
  UpdateFarmerInputSchema,
  CheckFarmerDuplicatesInputSchema,
  HouseholdResponseSchema,
  CreateHouseholdInputSchema,
  UpdateHouseholdInputSchema,
  PlotResponseSchema,
  CreatePlotInputSchema,
  UpdatePlotInputSchema,
  FarmResponseSchema,
  CreateFarmInputSchema,
  UpdateFarmInputSchema,
  PlotAllocationResponseSchema,
  CreatePlotAllocationInputSchema,
  UpdatePlotAllocationInputSchema,
  CropProductionResponseSchema,
  CreateCropProductionInputSchema,
  UpdateCropProductionInputSchema,
  WaterRequestResponseSchema,
  CreateWaterRequestInputSchema,
  TrainingResponseSchema,
  CreateTrainingInputSchema,
  UpdateTrainingInputSchema,
  StreamFlowReadingResponseSchema,
  RecordStreamFlowInputSchema,
  ReviewQueueItemSchema,
  SyncPushResponseSchema,
  SyncPullResponseSchema,
  SyncConflictResponseSchema,
  SyncQuarantineResponseSchema,
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

export const slisSchemas: Record<string, unknown> = {
  FarmerResponse: toJsonSchema(FarmerResponseSchema),
  CreateFarmerInput: toJsonSchema(CreateFarmerInputSchema),
  UpdateFarmerInput: toJsonSchema(UpdateFarmerInputSchema),
  CheckDuplicateFarmerInput: toJsonSchema(CheckFarmerDuplicatesInputSchema),
  HouseholdResponse: toJsonSchema(HouseholdResponseSchema),
  CreateHouseholdInput: toJsonSchema(CreateHouseholdInputSchema),
  UpdateHouseholdInput: toJsonSchema(UpdateHouseholdInputSchema),
  PlotResponse: toJsonSchema(PlotResponseSchema),
  CreatePlotInput: toJsonSchema(CreatePlotInputSchema),
  UpdatePlotInput: toJsonSchema(UpdatePlotInputSchema),
  FarmResponse: toJsonSchema(FarmResponseSchema),
  CreateFarmInput: toJsonSchema(CreateFarmInputSchema),
  UpdateFarmInput: toJsonSchema(UpdateFarmInputSchema),
  PlotAllocationResponse: toJsonSchema(PlotAllocationResponseSchema),
  CreatePlotAllocationInput: toJsonSchema(CreatePlotAllocationInputSchema),
  UpdatePlotAllocationInput: toJsonSchema(UpdatePlotAllocationInputSchema),
  CropProductionResponse: toJsonSchema(CropProductionResponseSchema),
  CreateCropProductionInput: toJsonSchema(CreateCropProductionInputSchema),
  UpdateCropProductionInput: toJsonSchema(UpdateCropProductionInputSchema),
  WaterRequestResponse: toJsonSchema(WaterRequestResponseSchema),
  CreateWaterRequestInput: toJsonSchema(CreateWaterRequestInputSchema),
  TrainingResponse: toJsonSchema(TrainingResponseSchema),
  CreateTrainingInput: toJsonSchema(CreateTrainingInputSchema),
  UpdateTrainingInput: toJsonSchema(UpdateTrainingInputSchema),
  StreamFlowReadingResponse: toJsonSchema(StreamFlowReadingResponseSchema),
  CreateStreamFlowReadingInput: toJsonSchema(RecordStreamFlowInputSchema),
  ReviewQueueItemResponse: toJsonSchema(ReviewQueueItemSchema),
  SyncConflictResponse: toJsonSchema(SyncConflictResponseSchema),
  SyncQuarantineResponse: toJsonSchema(SyncQuarantineResponseSchema),
  SyncPushResponse: toJsonSchema(SyncPushResponseSchema),
  SyncPullResponse: toJsonSchema(SyncPullResponseSchema),
  DeviceRegistrationResponse: { type: 'object' },
};

export const slisPaths: Record<string, Record<string, unknown>> = {
  // -------------------------------------------------------------
  // FARMERS & HOUSEHOLDS (BE-2.2)
  // -------------------------------------------------------------
  '/slis/farmers': {
    get: {
      summary: 'List farmers within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of farmers',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { $ref: '#/components/schemas/FarmerResponse' } },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Register a new farmer',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Farmer created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FarmerResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/slis/farmers/check-duplicate': {
    post: {
      summary: 'Check farmer duplicate identity without exposing unmasked data',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Duplicate status result',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  isDuplicate: { type: 'boolean' },
                  existingFarmerId: { type: 'string', nullable: true },
                },
                required: ['isDuplicate'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/farmers/{id}': {
    get: {
      summary: 'Get farmer details by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Farmer details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FarmerResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    patch: {
      summary: 'Update farmer record with optimistic concurrency',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Farmer updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FarmerResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/farmers/{id}/identities': {
    get: {
      summary: 'List masked identity documents for farmer',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'List of masked identity documents',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    documentTypeCode: { type: 'string' },
                    maskedNumber: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    post: {
      summary: 'Add identity document to farmer',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Identity document added',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  maskedNumber: { type: 'string' },
                },
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/farmers/{id}/identities/{identityId}': {
    delete: {
      summary: 'Remove identity document from farmer',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Identity document removed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
                required: ['success'],
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
  },

  '/slis/households': {
    get: {
      summary: 'List households within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of households',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/HouseholdResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create a new household',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Household created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HouseholdResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/households/{id}': {
    get: {
      summary: 'Get household details by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Household details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HouseholdResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    patch: {
      summary: 'Update household record',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Household updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HouseholdResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  // -------------------------------------------------------------
  // PLOTS, FARMS, ALLOCATIONS (BE-2.3)
  // -------------------------------------------------------------
  '/slis/plots': {
    get: {
      summary: 'List plots within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of plots',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { $ref: '#/components/schemas/PlotResponse' } },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create a new plot with polygon boundary',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Plot created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlotResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 422),
      },
    },
  },

  '/slis/plots/{id}': {
    get: {
      summary: 'Get plot details by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Plot details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlotResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    patch: {
      summary: 'Update plot attributes or boundary',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Plot updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlotResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409, 422),
      },
    },
  },

  '/slis/farms': {
    get: {
      summary: 'List farms within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of farms',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { $ref: '#/components/schemas/FarmResponse' } },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create a new farm',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Farm created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FarmResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/farms/{id}': {
    get: {
      summary: 'Get farm details by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Farm details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FarmResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    patch: {
      summary: 'Update farm details',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Farm updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/FarmResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/allocations': {
    get: {
      summary: 'List plot allocations within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of plot allocations',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/PlotAllocationResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Allocate a plot to farmer or WUA',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Plot allocated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlotAllocationResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 409),
      },
    },
  },

  '/slis/allocations/{id}': {
    get: {
      summary: 'Get plot allocation by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Plot allocation details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlotAllocationResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    patch: {
      summary: 'Update plot allocation',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Plot allocation updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlotAllocationResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/allocations/{id}/deallocate': {
    post: {
      summary: 'Deallocate plot with end date',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Plot deallocated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlotAllocationResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  // -------------------------------------------------------------
  // OPERATIONS: WATER, CROPS, TRAININGS, STREAM FLOW (BE-2.4)
  // -------------------------------------------------------------
  '/slis/water-requests': {
    get: {
      summary: 'List water requests within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of water requests',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/WaterRequestResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Submit a new water request',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Water request created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WaterRequestResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/water-requests/{id}': {
    get: {
      summary: 'Get water request details by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Water request details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WaterRequestResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
  },

  '/slis/water-requests/{id}/decide': {
    post: {
      summary: 'Approve or reject water request',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Water request decision recorded',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WaterRequestResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/crops': {
    get: {
      summary: 'List crop production records within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of crop production records',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/CropProductionResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Record new crop production',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Crop production created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CropProductionResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/crops/{id}': {
    get: {
      summary: 'Get crop production record by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Crop production details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CropProductionResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    patch: {
      summary: 'Update crop production record',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Crop production updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CropProductionResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/trainings': {
    get: {
      summary: 'List training sessions within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of training sessions',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/TrainingResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Create a new training session',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Training session created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TrainingResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/trainings/{id}': {
    get: {
      summary: 'Get training session details by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Training session details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TrainingResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    patch: {
      summary: 'Update training session details',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Training session updated successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TrainingResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/trainings/{id}/attendance': {
    get: {
      summary: 'List attendance records for training session',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'List of attendees',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    farmerId: { type: 'string' },
                    attended: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
    post: {
      summary: 'Record attendance for a training session by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Attendance recorded successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
                required: ['success'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404),
      },
    },
  },

  '/slis/trainings/attendance': {
    post: {
      summary: 'Record training attendance directly',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Attendance recorded successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
                required: ['success'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404),
      },
    },
  },

  '/slis/stream-flows': {
    get: {
      summary: 'List stream flow readings within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of stream flow readings',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/StreamFlowReadingResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
    post: {
      summary: 'Record a new stream flow reading',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '201': {
          description: 'Stream flow reading recorded successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StreamFlowReadingResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/stream-flows/{id}': {
    get: {
      summary: 'Get stream flow reading by ID',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Stream flow reading details',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StreamFlowReadingResponse' },
            },
          },
        },
        ...standardErrorResponses(401, 403, 404),
      },
    },
  },

  // -------------------------------------------------------------
  // REVIEW & APPROVAL WORKFLOW (BE-2.5)
  // -------------------------------------------------------------
  '/slis/review/queue': {
    get: {
      summary: 'List submitted records awaiting review within scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Paginated list of review queue items',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/ReviewQueueItemResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/review/submit/{entity}': {
    post: {
      summary: 'Submit a draft record for review',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Record submitted for review',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string', example: 'submitted' },
                  version: { type: 'integer' },
                },
                required: ['id', 'status', 'version'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/review/{entity}/{id}/approve': {
    post: {
      summary: 'Approve a submitted record (anti-self-approval enforced)',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Record approved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string', example: 'approved' },
                  version: { type: 'integer' },
                },
                required: ['id', 'status', 'version'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/review/{entity}/{id}/return': {
    post: {
      summary: 'Return a submitted record with mandatory reason comment',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Record returned with comment',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string', example: 'returned' },
                  returnComment: { type: 'string' },
                  version: { type: 'integer' },
                },
                required: ['id', 'status', 'version'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/review/bulk-approve': {
    post: {
      summary: 'Bulk approve submitted records in one transaction',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Bulk approval outcome summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  approved: { type: 'integer' },
                  skipped: { type: 'integer' },
                },
                required: ['approved', 'skipped'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  // -------------------------------------------------------------
  // SYNC SERVER ENGINE (BE-2.6)
  // -------------------------------------------------------------
  '/slis/sync/device/register': {
    post: {
      summary: 'Register or refresh collector device with offline grant',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Device registration and offline grant',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DeviceRegistrationResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/sync/push': {
    post: {
      summary: 'Push batch of offline operations through domain validation',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Outcomes per pushed operation',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SyncPushResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/sync/pull': {
    get: {
      summary: 'Pull server changes with composite transaction cursor',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Incremental changes and safe watermark',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SyncPullResponse' },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/sync/conflicts': {
    get: {
      summary: 'List sync conflicts within scheme scope',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'List of sync conflicts',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SyncConflictResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/sync/conflicts/{id}/resolve': {
    post: {
      summary: 'Resolve sync conflict by accepting server or device record',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Conflict resolution recorded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  resolved: { type: 'boolean' },
                },
                required: ['resolved'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },

  '/slis/sync/quarantine': {
    get: {
      summary: 'List quarantined operations',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'List of quarantined operations',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SyncQuarantineResponse' },
                  },
                  nextCursor: { type: 'string', nullable: true },
                },
                required: ['items'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403),
      },
    },
  },

  '/slis/sync/quarantine/{id}/resolve': {
    post: {
      summary: 'Resolve quarantined operation by re-running domain validation or discarding',
      tags: ['slis'],
      security: SECURED,
      responses: {
        '200': {
          description: 'Quarantine resolution outcome',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                },
                required: ['status'],
              },
            },
          },
        },
        ...standardErrorResponses(400, 401, 403, 404, 409),
      },
    },
  },
};
