
import { z } from 'zod';
import { insertDocumentSchema, insertNumberSchema, documents, numbers } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  conflict: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  documents: {
    create: {
      method: 'POST' as const,
      path: '/api/documents',
      input: insertDocumentSchema.optional(),
      responses: {
        201: z.custom<typeof documents.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/documents/:id',
      responses: {
        200: z.custom<typeof documents.$inferSelect & { numbers: typeof numbers.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/documents/:id',
      input: insertDocumentSchema.partial(),
      responses: {
        200: z.custom<typeof documents.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  numbers: {
    create: {
      method: 'POST' as const,
      path: '/api/documents/:id/numbers',
      input: insertNumberSchema,
      responses: {
        201: z.custom<typeof numbers.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        409: errorSchemas.conflict, // Duplicate number
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/documents/:id/numbers',
      responses: {
        200: z.array(z.custom<typeof numbers.$inferSelect>()),
        404: errorSchemas.notFound,
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
