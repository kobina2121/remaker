import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateDocumentRequest, type CreateNumberRequest, type UpdateDocumentRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// ============================================
// DOCUMENTS
// ============================================

export function useCreateDocument() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: CreateDocumentRequest = { name: "Untitled List" }) => {
      const res = await fetch(api.documents.create.path, {
        method: api.documents.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create document');
      return api.documents.create.responses[201].parse(await res.json());
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not create a new list. Please try again.",
      });
    }
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: [api.documents.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.documents.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch document');
      return api.documents.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & UpdateDocumentRequest) => {
      const url = buildUrl(api.documents.update.path, { id });
      const res = await fetch(url, {
        method: api.documents.update.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update document');
      return api.documents.update.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.documents.get.path, variables.id] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Could not rename the document.",
      });
    }
  });
}

// ============================================
// NUMBERS (ITEMS)
// ============================================

export function useAddNumber() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ docId, value }: { docId: string, value: string }) => {
      const url = buildUrl(api.numbers.create.path, { id: docId });
      const res = await fetch(url, {
        method: api.numbers.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      
      if (res.status === 409) {
        throw new Error('Duplicate ID detected'); // Custom error for conflict
      }
      
      if (!res.ok) throw new Error('Failed to add number');
      return api.numbers.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.documents.get.path, variables.docId] });
      // We also invalidate the numbers list specifically if we had a separate hook for it, 
      // but right now it's embedded in the document get.
    },
    onError: (error) => {
      // 409 handled specifically in UI component via try/catch or onError prop
      // General errors:
      if (error.message !== 'Duplicate ID detected') {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Something went wrong adding the number.",
        });
      }
    }
  });
}
