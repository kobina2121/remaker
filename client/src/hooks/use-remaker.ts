import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type {
  AuditRecord,
  DocumentWithRecords,
  CreateDocumentRequest,
  UpdateDocumentRequest,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

/** Error carrying the row numbers the server rejected, for highlighting. */
export class ApiError extends Error {
  rows?: number[];
  status: number;

  constructor(message: string, status: number, rows?: number[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.rows = rows;
  }
}

/**
 * fetch() only rejects when the server cannot be reached at all (it is not
 * running, or was stopped). The browser reports that as a bare "Failed to
 * fetch", so replace it with something that says what to do.
 */
async function send(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(
      "Can't reach the Remaker server. Make sure the app is running (npm run dev), then try again.",
      0,
    );
  }
}

async function request<T>(url: string, init: RequestInit, parse: (data: unknown) => T): Promise<T> {
  const res = await send(url, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let rows: number[] | undefined;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      if (Array.isArray(body?.rows)) rows = body.rows;
    } catch {
      // Non-JSON error body; keep the status-based message.
    }
    throw new ApiError(message, res.status, rows);
  }

  if (res.status === 204) return parse(null);
  return parse(await res.json());
}

// ============================================
// DOCUMENTS
// ============================================

export const documentsKey = [api.documents.list.path] as const;
export const documentKey = (id: string) => [api.documents.get.path, id] as const;

/** All lists, for the dashboard. */
export function useDocuments() {
  return useQuery({
    queryKey: documentsKey,
    queryFn: () =>
      request(api.documents.list.path, { method: "GET" }, (data) =>
        api.documents.list.responses[200].parse(data),
      ),
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: documentKey(id),
    queryFn: async () => {
      const url = buildUrl(api.documents.get.path, { id });
      const res = await send(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new ApiError("Failed to load list", res.status);
      return api.documents.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateDocumentRequest = {}) =>
      request(
        api.documents.create.path,
        { method: api.documents.create.method, body: JSON.stringify(data) },
        (res) => api.documents.create.responses[201].parse(res),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentsKey });
    },
    onError: (error: ApiError) => {
      toast({
        variant: "destructive",
        title: "Could not create list",
        description: error.message,
      });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string } & UpdateDocumentRequest) =>
      request(
        buildUrl(api.documents.update.path, { id }),
        { method: api.documents.update.method, body: JSON.stringify(updates) },
        (res) => api.documents.update.responses[200].parse(res),
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: documentKey(variables.id) });
      queryClient.invalidateQueries({ queryKey: documentsKey });
    },
    onError: (error: ApiError) => {
      toast({ variant: "destructive", title: "Rename failed", description: error.message });
    },
  });
}

export function useDeleteDocuments() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 1) {
        await request(
          buildUrl(api.documents.remove.path, { id: ids[0] }),
          { method: api.documents.remove.method },
          () => null,
        );
        return { deleted: 1 };
      }

      return request(
        api.documents.bulkRemove.path,
        { method: api.documents.bulkRemove.method, body: JSON.stringify({ ids }) },
        (res) => api.documents.bulkRemove.responses[200].parse(res),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentsKey });
    },
    onError: (error: ApiError) => {
      toast({ variant: "destructive", title: "Delete failed", description: error.message });
    },
  });
}

// ============================================
// RECORDS
// ============================================

/** Save All - replaces every row in the list. */
export function useSaveRecords() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, records }: { id: string; records: AuditRecord[] }) =>
      request(
        buildUrl(api.records.save.path, { id }),
        { method: api.records.save.method, body: JSON.stringify({ records }) },
        (res) => api.records.save.responses[200].parse(res),
      ),
    onSuccess: (data, variables) => {
      // The browser already holds exactly what was saved, so update the cached
      // copy directly rather than downloading the whole list again.
      queryClient.setQueryData<DocumentWithRecords | null>(documentKey(variables.id), (old) =>
        old ? { ...old, records: variables.records, updatedAt: data.savedAt } : old,
      );
      queryClient.invalidateQueries({ queryKey: documentsKey });
    },
  });
}
