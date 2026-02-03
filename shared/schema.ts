
import { pgTable, text, serial, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default("Untitled List"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const numbers = pgTable("numbers", {
  id: serial("id").primaryKey(),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // Ensure values are unique per document
  uniqueValuePerDoc: unique().on(t.documentId, t.value),
}));

// === RELATIONS ===

export const documentsRelations = relations(documents, ({ many }) => ({
  numbers: many(numbers),
}));

export const numbersRelations = relations(numbers, ({ one }) => ({
  document: one(documents, {
    fields: [numbers.documentId],
    references: [documents.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertDocumentSchema = createInsertSchema(documents).pick({
  name: true,
});

export const insertNumberSchema = createInsertSchema(numbers).pick({
  value: true,
});

// === EXPLICIT API CONTRACT TYPES ===

export type Document = typeof documents.$inferSelect;
export type NumberItem = typeof numbers.$inferSelect;

export type CreateDocumentRequest = z.infer<typeof insertDocumentSchema>;
export type UpdateDocumentRequest = Partial<CreateDocumentRequest>;
export type CreateNumberRequest = z.infer<typeof insertNumberSchema>;

export type DocumentResponse = Document & { numbers?: NumberItem[] };
