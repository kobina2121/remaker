import { z } from "zod";
import { AUDIT_DIGITS, AUDIT_PREFIX_LENGTH, DEFAULT_WHITELIST } from "./audit";
import { DEFAULT_CATEGORY, isValidCategory } from "./categories";

// === BASE SCHEMAS ===

/**
 * One row of a list. Record ID / Box ID are derived from the audit number when
 * a row is entered, but they are stored rather than recomputed because the
 * editor allows correcting them by hand (Phase 6).
 */
export const auditRecordSchema = z.object({
  auditNo: z
    .string()
    .regex(
      new RegExp(`^([A-Za-z]{${AUDIT_PREFIX_LENGTH}})?\\d{${AUDIT_DIGITS}}$`),
      `Audit number must be ${AUDIT_DIGITS} digits, optionally led by ${AUDIT_PREFIX_LENGTH} letters`,
    ),
  recordId: z.string().trim().min(1, "Record ID is required"),
  boxId: z.string().trim().min(1, "Box ID is required"),
  whitelist: z.string().trim().min(1, "Whitelist is required"),
});

export const documentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  whitelist: z.string(),
  /** Remake category this list belongs to; every list has exactly one. */
  category: z.string(),
  /** Two-letter prefix applied to this list's audit numbers, or "" for none. */
  auditPrefix: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const documentSummarySchema = documentSchema.extend({
  recordCount: z.number().int().nonnegative(),
});

export const documentWithRecordsSchema = documentSchema.extend({
  records: z.array(auditRecordSchema),
});

// === INPUTS ===

export const insertDocumentSchema = z.object({
  name: z.string().trim().min(1).default("Untitled List"),
  category: z
    .string()
    .trim()
    .refine(isValidCategory, "Unknown remake category")
    .default(DEFAULT_CATEGORY),
  whitelist: z.string().trim().min(1).default(DEFAULT_WHITELIST),
  auditPrefix: z
    .string()
    .trim()
    .regex(new RegExp(`^([A-Za-z]{${AUDIT_PREFIX_LENGTH}})?$`), "Prefix must be two letters or empty")
    .default(""),
});

export const updateDocumentSchema = z.object({
  name: z.string().trim().min(1).optional(),
  category: z
    .string()
    .trim()
    .refine(isValidCategory, "Unknown remake category")
    .optional(),
  whitelist: z.string().trim().min(1).optional(),
  auditPrefix: z
    .string()
    .trim()
    .regex(new RegExp(`^([A-Za-z]{${AUDIT_PREFIX_LENGTH}})?$`), "Prefix must be two letters or empty")
    .optional(),
});

/** Save All replaces the whole set of rows in one request. */
export const saveRecordsSchema = z.object({
  records: z.array(auditRecordSchema),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Select at least one list"),
});

// === EXPLICIT API CONTRACT TYPES ===

export type AuditRecord = z.infer<typeof auditRecordSchema>;
export type Document = z.infer<typeof documentSchema>;
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export type DocumentWithRecords = z.infer<typeof documentWithRecordsSchema>;

export type CreateDocumentRequest = z.input<typeof insertDocumentSchema>;
export type UpdateDocumentRequest = z.input<typeof updateDocumentSchema>;
export type SaveRecordsRequest = z.input<typeof saveRecordsSchema>;
export type BulkDeleteRequest = z.input<typeof bulkDeleteSchema>;
