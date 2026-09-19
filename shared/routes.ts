import { z } from 'zod';
import {
  bulkDeleteSchema,
  documentSchema,
  documentSummarySchema,
  documentWithRecordsSchema,
  insertDocumentSchema,
  saveRecordsSchema,
  updateDocumentSchema,
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
    /** Row numbers (1-based) that failed validation, for highlighting in the editor. */
    rows: z.array(z.number().int()).optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  conflict: z.object({
    message: z.string(),
    rows: z.array(z.number().int()).optional(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  documents: {
    list: {
      method: 'GET' as const,
      path: '/api/documents',
      responses: {
        200: z.array(documentSummarySchema),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/documents',
      input: insertDocumentSchema.optional(),
      responses: {
        201: documentSchema,
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/documents/:id',
      responses: {
        200: documentWithRecordsSchema,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/documents/:id',
      input: updateDocumentSchema,
      responses: {
        200: documentSchema,
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    remove: {
      method: 'DELETE' as const,
      path: '/api/documents/:id',
      responses: {
        204: z.null(),
        404: errorSchemas.notFound,
      },
    },
    bulkRemove: {
      method: 'POST' as const,
      path: '/api/documents/bulk-delete',
      input: bulkDeleteSchema,
      responses: {
        200: z.object({ deleted: z.number().int() }),
        400: errorSchemas.validation,
      },
    },
  },
  records: {
    /** Save All - replaces every row in the list. */
    save: {
      method: 'PUT' as const,
      path: '/api/documents/:id/records',
      input: saveRecordsSchema,
      responses: {
        // Only a count: echoing every row back made a 50,000-row save take seconds.
        200: z.object({ count: z.number().int().nonnegative(), savedAt: z.coerce.date() }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        409: errorSchemas.conflict, // duplicate audit number or record id
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
