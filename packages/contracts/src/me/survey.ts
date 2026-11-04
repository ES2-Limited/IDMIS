import { z } from 'zod';
import { BaseListQuerySchema } from '../core/common';
import { SurveyAnswerTypeSchema } from './enums';

// 1. Survey
export const SurveySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  version: z.number().int().positive().default(1),
  schemeId: z.string().uuid().nullable().optional(),
  opensOn: z.string().date().nullable().optional(),
  closesOn: z.string().date().nullable().optional(),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type Survey = z.infer<typeof SurveySchema>;

export const CreateSurveyInputSchema = z.object({
  name: z.string().min(1),
  schemeId: z.string().uuid().optional(),
  opensOn: z.string().date().optional(),
  closesOn: z.string().date().optional(),
});

export type CreateSurveyInput = z.infer<typeof CreateSurveyInputSchema>;

export const UpdateSurveyInputSchema = z.object({
  name: z.string().min(1).optional(),
  schemeId: z.string().uuid().optional(),
  opensOn: z.string().date().optional(),
  closesOn: z.string().date().optional(),
  version: z.number().int().positive(),
});

export type UpdateSurveyInput = z.infer<typeof UpdateSurveyInputSchema>;

export const ListSurveysQuerySchema = BaseListQuerySchema.extend({
  schemeId: z.string().uuid().optional(),
});

export type ListSurveysQuery = z.infer<typeof ListSurveysQuerySchema>;

// 2. Survey Question
export const SurveyQuestionSchema = z.object({
  id: z.string().uuid(),
  surveyId: z.string().uuid(),
  code: z.string().min(1),
  text: z.string().min(1),
  answerType: SurveyAnswerTypeSchema,
  options: z
    .union([z.array(z.string()), z.record(z.string(), z.unknown())])
    .nullable()
    .optional(),
  sortOrder: z.number().int(),
  isRequired: z.boolean().default(false),
});

export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

export const CreateSurveyQuestionInputSchema = z.object({
  surveyId: z.string().uuid().optional(),
  code: z.string().min(1),
  text: z.string().min(1),
  answerType: SurveyAnswerTypeSchema,
  options: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
  sortOrder: z.number().int().default(0),
  isRequired: z.boolean().default(false),
});

export type CreateSurveyQuestionInput = z.infer<typeof CreateSurveyQuestionInputSchema>;

export const UpdateSurveyQuestionInputSchema = z.object({
  code: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  answerType: SurveyAnswerTypeSchema.optional(),
  options: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
  sortOrder: z.number().int().optional(),
  isRequired: z.boolean().optional(),
});

export type UpdateSurveyQuestionInput = z.infer<typeof UpdateSurveyQuestionInputSchema>;

// 3. Survey Answer
export const CreateSurveyAnswerInputSchema = z.object({
  questionId: z.string().uuid().optional(),
  questionCode: z.string().optional(),
  value: z.unknown(),
});

export type CreateSurveyAnswerInput = z.infer<typeof CreateSurveyAnswerInputSchema>;

export const SurveyAnswerSchema = z.object({
  id: z.string().uuid(),
  responseId: z.string().uuid(),
  questionId: z.string().uuid(),
  value: z.unknown(),
});

export type SurveyAnswer = z.infer<typeof SurveyAnswerSchema>;

// 4. Survey Response
export const SurveyResponseSchema = z.object({
  id: z.string().uuid(),
  surveyId: z.string().uuid(),
  schemeId: z.string().uuid().nullable().optional(),
  farmerId: z.string().uuid().nullable().optional(),
  householdId: z.string().uuid().nullable().optional(),
  collectedAt: z.string().datetime(),
  location: z.unknown().nullable().optional(),
  status: z.string().default('submitted'),
  deviceId: z.string().uuid().nullable().optional(),
  importBatchId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export type SurveyResponse = z.infer<typeof SurveyResponseSchema>;

export const CreateSurveyResponseInputSchema = z.object({
  id: z.string().uuid().optional(),
  surveyId: z.string().uuid(),
  schemeId: z.string().uuid().optional(),
  farmerId: z.string().uuid().optional(),
  householdId: z.string().uuid().optional(),
  collectedAt: z.string().datetime().optional(),
  location: z.unknown().optional(),
  answers: z.array(CreateSurveyAnswerInputSchema).default([]),
});

export type CreateSurveyResponseInput = z.infer<typeof CreateSurveyResponseInputSchema>;

export const ListSurveyResponsesQuerySchema = BaseListQuerySchema.extend({
  surveyId: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional(),
});

export type ListSurveyResponsesQuery = z.infer<typeof ListSurveyResponsesQuerySchema>;

/**
 * Validates whether GPS coordinates fall within Nigeria's territorial bounds.
 * Approximate bounding box:
 * Latitude: 4.0° N to 14.0° N
 * Longitude: 2.5° E to 15.0° E
 */
export function isLocationInNigeria(lat: number, lon: number): boolean {
  return lat >= 4.0 && lat <= 14.0 && lon >= 2.5 && lon <= 15.0;
}
