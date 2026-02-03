
import { db } from "./db";
import {
  documents,
  numbers,
  type Document,
  type NumberItem,
  type CreateDocumentRequest,
  type UpdateDocumentRequest,
  type CreateNumberRequest,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // Documents
  createDocument(doc: CreateDocumentRequest): Promise<Document>;
  getDocument(id: string): Promise<(Document & { numbers: NumberItem[] }) | undefined>;
  updateDocument(id: string, updates: UpdateDocumentRequest): Promise<Document | undefined>;

  // Numbers
  addNumber(documentId: string, item: CreateNumberRequest): Promise<NumberItem>;
  getNumbers(documentId: string): Promise<NumberItem[]>;
  checkDuplicate(documentId: string, value: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async createDocument(doc: CreateDocumentRequest): Promise<Document> {
    const [newDoc] = await db.insert(documents).values(doc).returning();
    return newDoc;
  }

  async getDocument(id: string): Promise<(Document & { numbers: NumberItem[] }) | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (!doc) return undefined;

    const docNumbers = await db
      .select()
      .from(numbers)
      .where(eq(numbers.documentId, id))
      .orderBy(desc(numbers.createdAt));

    return { ...doc, numbers: docNumbers };
  }

  async updateDocument(id: string, updates: UpdateDocumentRequest): Promise<Document | undefined> {
    const [updated] = await db
      .update(documents)
      .set(updates)
      .where(eq(documents.id, id))
      .returning();
    return updated;
  }

  async addNumber(documentId: string, item: CreateNumberRequest): Promise<NumberItem> {
    const [newNumber] = await db
      .insert(numbers)
      .values({ ...item, documentId })
      .returning();
    return newNumber;
  }

  async getNumbers(documentId: string): Promise<NumberItem[]> {
    return db
      .select()
      .from(numbers)
      .where(eq(numbers.documentId, documentId))
      .orderBy(desc(numbers.createdAt));
  }

  async checkDuplicate(documentId: string, value: string): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(numbers)
      .where(and(eq(numbers.documentId, documentId), eq(numbers.value, value)));
    return !!existing;
  }
}

export const storage = new DatabaseStorage();
