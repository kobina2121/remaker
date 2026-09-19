import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  type AuditRecord,
  type CreateDocumentRequest,
  type Document,
  type DocumentSummary,
  type DocumentWithRecords,
  type UpdateDocumentRequest,
} from "@shared/schema";
import { DEFAULT_WHITELIST } from "@shared/audit";
import { DEFAULT_CATEGORY } from "@shared/categories";

export interface IStorage {
  listDocuments(): Promise<DocumentSummary[]>;
  createDocument(doc: CreateDocumentRequest): Promise<Document>;
  getDocument(id: string): Promise<DocumentWithRecords | undefined>;
  updateDocument(id: string, updates: UpdateDocumentRequest): Promise<Document | undefined>;
  deleteDocument(id: string): Promise<boolean>;
  deleteDocuments(ids: string[]): Promise<number>;
  saveRecords(id: string, records: AuditRecord[]): Promise<DocumentWithRecords | undefined>;
}

type StoredDocument = DocumentWithRecords;

/**
 * JSON-file storage, one file per list under DATA_DIR/lists.
 *
 * Electron points DATA_DIR at the app's userData folder so desktop lists live
 * outside the source tree; the web dev server falls back to ./data.
 *
 * Files are the source of truth. An in-memory Map mirrors them so the dashboard
 * does not have to re-read every list (which may hold tens of thousands of rows)
 * on each request. The server is single-process, so the mirror cannot drift.
 */
export class JsonFileStorage implements IStorage {
  private readonly dir: string;
  private cache = new Map<string, StoredDocument>();
  private ready: Promise<void> | null = null;

  constructor(dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), "data")) {
    this.dir = path.join(dataDir, "lists");
  }

  /** Reads every list off disk once, then serves from the mirror. */
  private async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await fs.mkdir(this.dir, { recursive: true });
        const files = await fs.readdir(this.dir);

        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          try {
            const raw = await fs.readFile(path.join(this.dir, file), "utf-8");
            const doc = JSON.parse(raw) as StoredDocument;
            // Lists saved before audit prefixes existed have no such field.
            if (doc?.id) {
              this.cache.set(doc.id, {
                ...doc,
                auditPrefix: doc.auditPrefix ?? "",
                // Lists created before categories existed fall into "Other".
                category: doc.category ?? DEFAULT_CATEGORY,
              });
            }
          } catch (err) {
            // A truncated or hand-edited file should not take the whole app down.
            console.error(`[storage] skipping unreadable list ${file}:`, err);
          }
        }
      })();
    }
    return this.ready;
  }

  private fileFor(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  /** Writes to a temp file first so an interrupted write cannot corrupt a list. */
  private async persist(doc: StoredDocument): Promise<void> {
    const target = this.fileFor(doc.id);
    const temp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(doc, null, 2), "utf-8");
    await fs.rename(temp, target);
  }

  private static toDocument(doc: StoredDocument): Document {
    const { records: _records, ...meta } = doc;
    return meta;
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    await this.init();

    return Array.from(this.cache.values())
      .map((doc) => ({
        ...JsonFileStorage.toDocument(doc),
        recordCount: doc.records.length,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async createDocument(doc: CreateDocumentRequest): Promise<Document> {
    await this.init();

    const now = new Date();
    const newDoc: StoredDocument = {
      id: randomUUID(),
      name: doc.name ?? "Untitled List",
      whitelist: doc.whitelist ?? DEFAULT_WHITELIST,
      category: doc.category ?? DEFAULT_CATEGORY,
      auditPrefix: doc.auditPrefix ?? "",
      createdAt: now,
      updatedAt: now,
      records: [],
    };

    this.cache.set(newDoc.id, newDoc);
    await this.persist(newDoc);
    return JsonFileStorage.toDocument(newDoc);
  }

  async getDocument(id: string): Promise<DocumentWithRecords | undefined> {
    await this.init();
    const doc = this.cache.get(id);
    return doc ? { ...doc, records: [...doc.records] } : undefined;
  }

  async updateDocument(id: string, updates: UpdateDocumentRequest): Promise<Document | undefined> {
    await this.init();

    const doc = this.cache.get(id);
    if (!doc) return undefined;

    const updated: StoredDocument = {
      ...doc,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.whitelist !== undefined ? { whitelist: updates.whitelist } : {}),
      ...(updates.auditPrefix !== undefined ? { auditPrefix: updates.auditPrefix.toUpperCase() } : {}),
      ...(updates.category !== undefined ? { category: updates.category } : {}),
      updatedAt: new Date(),
    };

    this.cache.set(id, updated);
    await this.persist(updated);
    return JsonFileStorage.toDocument(updated);
  }

  async deleteDocument(id: string): Promise<boolean> {
    await this.init();
    if (!this.cache.has(id)) return false;

    this.cache.delete(id);
    await fs.rm(this.fileFor(id), { force: true });
    return true;
  }

  async deleteDocuments(ids: string[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.deleteDocument(id)) deleted++;
    }
    return deleted;
  }

  async saveRecords(id: string, records: AuditRecord[]): Promise<DocumentWithRecords | undefined> {
    await this.init();

    const doc = this.cache.get(id);
    if (!doc) return undefined;

    const updated: StoredDocument = { ...doc, records, updatedAt: new Date() };
    this.cache.set(id, updated);
    await this.persist(updated);
    return { ...updated, records: [...updated.records] };
  }
}

export const storage: IStorage = new JsonFileStorage();
