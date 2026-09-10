import { z } from "zod";
import { LLM_MODEL_IDS } from "@/lib/llm/models";

/** Formula identifiers, parameter keys, and item input keys share this shape. */
export const IdentifierKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "must be snake_case, starting with a letter");

const ParameterFieldsSchema = z.object({
  key: IdentifierKeySchema,
  label: z.string().min(1),
  value: z.coerce.number().finite().optional(),
  /** A formula over other parameter keys, in place of a literal `value` — see lib/parameters/graph.ts. */
  formula: z.string().trim().min(1).nullable().optional(),
  /** Renders an input for this parameter on catalog item cards. Mutually exclusive with `formula`. */
  editable: z.boolean().optional(),
  unit: z.string().nullable().optional(),
  group: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const ParameterSchema = ParameterFieldsSchema.refine((data) => data.formula != null || data.value !== undefined, {
  message: "Provide a value or a formula.",
  path: ["value"],
}).refine((data) => !(data.editable && data.formula != null), {
  message: "A formula parameter cannot also be catalog-editable.",
  path: ["editable"],
});

export const ParameterUpdateSchema = ParameterFieldsSchema.partial();

export const CategorySchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, "must be kebab-case, starting with a letter"),
  icon: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const ItemInputSchema = z.object({
  key: IdentifierKeySchema,
  label: z.string().min(1),
  defaultValue: z.coerce.number().finite(),
  unit: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const ItemSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  formula: z.string().min(1),
  /** A simple-icons slug — see lib/icons.ts. */
  icon: z.string().nullable().optional(),
  unitLabel: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  inputs: z.array(ItemInputSchema).default([]),
});

export const ItemUpdateSchema = ItemSchema.partial();

export const FormulaValidateSchema = z.object({
  expression: z.string().min(1),
  itemId: z.string().uuid().optional(),
});

export const FormulaPreviewSchema = z.object({
  expression: z.string().min(1),
  itemId: z.string().uuid().optional(),
  inputs: z.record(z.string(), z.coerce.number().finite()).default({}),
  quantity: z.coerce.number().finite().default(1),
});

export const EstimateLineCreateSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().finite().default(1),
  inputValues: z.record(z.string(), z.coerce.number().finite()).default({}),
});

export const EstimateLineUpdateSchema = z.object({
  quantity: z.coerce.number().finite().optional(),
  inputValues: z.record(z.string(), z.coerce.number().finite()).optional(),
});

export const EstimateSaveSchema = z.object({
  name: z.string().min(1),
  client: z.string().nullable().optional(),
});

export const EstimateTargetBudgetSchema = z.object({
  targetBudget: z.coerce.number().finite().nullable(),
});

/** Metadata-only edit for a saved estimate — never the frozen formulas/totals. */
export const EstimateUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  client: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  targetBudget: z.coerce.number().finite().nullable().optional(),
});

/**
 * "Apply to Normo" on /llms/test. `z.enum` over the catalog puts model membership at the trust
 * boundary, so an unknown id is a 400 rather than an `undefined` dereference downstream.
 */
export const LlmApplySchema = z.object({
  n1ModelId: z.enum(LLM_MODEL_IDS),
  n2ModelId: z.enum(LLM_MODEL_IDS),
  /** 0–1. The UI edits a percentage; the wire carries the share. */
  n1TrafficShare: z.coerce.number().min(0).max(1),
  estimateId: z.string().uuid(),
});

export type ParameterInput = z.infer<typeof ParameterSchema>;
export type LlmApplyInput = z.infer<typeof LlmApplySchema>;
export type CategoryInput = z.infer<typeof CategorySchema>;
export type ItemInput = z.infer<typeof ItemSchema>;
export type FormulaPreviewInput = z.infer<typeof FormulaPreviewSchema>;
export type EstimateLineCreateInput = z.infer<typeof EstimateLineCreateSchema>;
