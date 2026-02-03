
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Create Document
  app.post(api.documents.create.path, async (req, res) => {
    try {
      const input = api.documents.create.input?.parse(req.body) || { name: "Untitled List" };
      const doc = await storage.createDocument(input);
      res.status(201).json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Get Document
  app.get(api.documents.get.path, async (req, res) => {
    const doc = await storage.getDocument(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    res.json(doc);
  });

  // Update Document
  app.patch(api.documents.update.path, async (req, res) => {
    try {
      const input = api.documents.update.input.parse(req.body);
      const doc = await storage.updateDocument(req.params.id, input);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }
      res.json(doc);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Add Number
  app.post(api.numbers.create.path, async (req, res) => {
    try {
      const { id } = req.params;
      const input = api.numbers.create.input.parse(req.body);

      // Check for duplicate first
      const isDuplicate = await storage.checkDuplicate(id, input.value);
      if (isDuplicate) {
        return res.status(409).json({ message: "Duplicate ID number detected" });
      }

      // Check if document exists
      const doc = await storage.getDocument(id);
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }

      const number = await storage.addNumber(id, input);
      res.status(201).json(number);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // List Numbers
  app.get(api.numbers.list.path, async (req, res) => {
    const { id } = req.params;
    const doc = await storage.getDocument(id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    const numbers = await storage.getNumbers(id);
    res.json(numbers);
  });

  return httpServer;
}
