import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { rowKey } from "@shared/audit";
import type { AuditRecord } from "@shared/schema";
import { z } from "zod";

function firstRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? "";
}

function zodError(err: z.ZodError) {
  const issue = err.errors[0];
  // For `records.3.auditNo` the row number is the numeric path segment.
  const rowIndex = issue.path.find((segment) => typeof segment === "number");

  return {
    message: issue.message,
    field: issue.path.join("."),
    ...(typeof rowIndex === "number" ? { rows: [rowIndex + 1] } : {}),
  };
}

/**
 * Duplicate detection across a whole list.
 *
 * Audit numbers must be unique. Record ID + Box ID must also be unique: the box
 * counter wraps every 1,000,000 audits, so two rows that far apart collide even
 * though their audit numbers differ.
 */
function findDuplicates(records: AuditRecord[]) {
  const seenAudit = new Map<string, number>();
  const seenKey = new Map<string, number>();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    const priorAudit = seenAudit.get(record.auditNo);
    if (priorAudit !== undefined) {
      return {
        message: `Duplicate audit number ${record.auditNo} on rows ${priorAudit + 1} and ${i + 1}`,
        rows: [priorAudit + 1, i + 1],
      };
    }
    seenAudit.set(record.auditNo, i);

    const key = rowKey(record);
    const priorKey = seenKey.get(key);
    if (priorKey !== undefined) {
      return {
        message: `Duplicate Record ID ${record.recordId} / Box ID ${record.boxId} on rows ${priorKey + 1} and ${i + 1}`,
        rows: [priorKey + 1, i + 1],
      };
    }
    seenKey.set(key, i);
  }

  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // List all documents (dashboard)
  app.get(api.documents.list.path, async (_req, res) => {
    res.json(await storage.listDocuments());
  });

  // Bulk delete - declared before /:id so it is not captured as an id
  app.post(api.documents.bulkRemove.path, async (req, res) => {
    try {
      const input = api.documents.bulkRemove.input.parse(req.body);
      const deleted = await storage.deleteDocuments(input.ids);
      res.json({ deleted });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      throw err;
    }
  });

  // Create document
  app.post(api.documents.create.path, async (req, res) => {
    try {
      const input = api.documents.create.input?.parse(req.body ?? {}) ?? {};
      const doc = await storage.createDocument(input);
      res.status(201).json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      throw err;
    }
  });

  // Get one document with its rows
  app.get(api.documents.get.path, async (req, res) => {
    const doc = await storage.getDocument(firstRouteParam(req.params.id));
    if (!doc) return res.status(404).json({ message: "List not found" });
    res.json(doc);
  });

  // Rename / change whitelist
  app.patch(api.documents.update.path, async (req, res) => {
    try {
      const input = api.documents.update.input.parse(req.body);
      const doc = await storage.updateDocument(firstRouteParam(req.params.id), input);
      if (!doc) return res.status(404).json({ message: "List not found" });
      res.json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      throw err;
    }
  });

  // Delete one document
  app.delete(api.documents.remove.path, async (req, res) => {
    const deleted = await storage.deleteDocument(firstRouteParam(req.params.id));
    if (!deleted) return res.status(404).json({ message: "List not found" });
    res.status(204).end();
  });

  // Save All - replaces every row in the list
  app.put(api.records.save.path, async (req, res) => {
    try {
      const id = firstRouteParam(req.params.id);
      const input = api.records.save.input.parse(req.body);

      const duplicate = findDuplicates(input.records);
      if (duplicate) return res.status(409).json(duplicate);

      const doc = await storage.saveRecords(id, input.records);
      if (!doc) return res.status(404).json({ message: "List not found" });

      res.json({ count: doc.records.length, savedAt: doc.updatedAt });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      throw err;
    }
  });

  return httpServer;
}
