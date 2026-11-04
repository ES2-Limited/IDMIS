import { z } from 'zod';
import { SurveyAnswerTypeSchema } from './enums';

// 1. Survey
export const SurveySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  version: z.number().int().positive().default(1),
  schemeId: z.string().uuid().nullable().optional(),
  opensOn: z.string().date().nullable().optional(),
  closesOn: z.string().date().nullable().optional(),
  versionNumber: z.number().int().positive().default(1),
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

// 2. Survey Question
export const SurveyQuestionSchema = z.object({
  id: z.string().uuid(),
  surveyId: z.string().uuid(),
  code: z.string().min(1),
  text: z.string().min(1),
  answerType: SurveyAnswerTypeSchema,
  options: z.record(z.string(), z.unknown()).nullable().optional(),
  sortOrder: z.number().int(),
  isRequired: z.boolean().default(false),
});

export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

export const CreateSurveyQuestionInputSchema = z.object({
  surveyId: z.string().uuid(),
  code: z.string().min(1),
  text: z.string().min(1),
  answerType: SurveyAnswerTypeSchema,
  options: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int(),
  isRequired: z.boolean().default(false),
});

export type CreateSurveyQuestionInput = z.infer<typeof CreateSurveyQuestionInputSchema>;

// 3. Survey Response
export const SurveyResponseSchema = z.object({
  id: z.string().uuid(),
  surveyId: z.string().uuid(),
  schemeId: z.string().uuid().nullable().optional(),
  farmerId: z.string().uuid().nullable().optional(),
  householdId: z.string().uuid().nullable().optional(),
  collectedAt: z.string().datetime(),
  location: z.unknown().nullable().optional(),
  status: z.string().default('draft'),
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

// 4. Survey Answer
export const SurveyAnswerSchema = z.object({
  id: z.string().uuid(),
  responseId: z.string().uuid(),
  questionId: z.string().uuid(),
  value: z.unknown(),
});

export type SurveyAnswer = z.infer<typeof SurveyAnswerSchema>;
