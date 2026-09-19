import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useDocuments, useCreateDocument, useDeleteDocuments } from "@/hooks/use-remaker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { formatDistanceToNow } from "date-fns";
import { buildTxt, downloadTxt, shareText } from "@/lib/export";
import { api, buildUrl } from "@shared/routes";
import type { DocumentSummary } from "@shared/schema";
import { cn } from "@/lib/utils";
import { CategoryPicker } from "@/components/CategoryPicker";
import { REMAKE_CATEGORIES, categoryLabel } from "@shared/categories";

type SortKey = "updated" | "name" | "records";

const SORT_LABELS: Record<SortKey, string> = {
  updated: "Recently updated",
  name: "Name (A–Z)",
  records: "Most records",
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: documents, isLoading } = useDocuments();
  const createDoc = useCreateDocument();
  const deleteDocs = useDeleteDocuments();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [category, setCategory] = useState<string>("all");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, the way most list UIs behave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** How many lists sit in each category, for the filter chips. */
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents ?? []) {
      counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1);
    }
    return counts;
  }, [documents]);

  const totalRecords = useMemo(
    () => (documents ?? []).reduce((sum, doc) => sum + doc.recordCount, 0),
    [documents],
  );

  // Search matches the list name or its internal id.
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const inCategory =
      category === "all" ? documents ?? [] : (documents ?? []).filter((d) => d.category === category);

    const matched = query
      ? inCategory.filter(
          (doc) =>
            doc.name.toLowerCase().includes(query) || doc.id.toLowerCase().includes(query),
        )
      : inCategory;

    const sorted = [...matched];
    sorted.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "records") return b.recordCount - a.recordCount;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return sorted;
  }, [documents, search, sort, category]);

  const visibleIds = visible.map((doc) => doc.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleAllVisible = () =>
    setSelected(
      allVisibleSelected
        ? selected.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...selected, ...visibleIds])),
    );

  /** Step 1: choose a remake type. Step 2 (below) actually creates the list. */
  const handleCreate = () => setPickerOpen(true);

  const handleSelectCategory = (categoryId: string) => {
    setPendingCategory(categoryId);
    createDoc.mutate(
      { name: `Untitled ${categoryLabel(categoryId)} List`, category: categoryId },
      {
        onSuccess: (doc) => setLocation(`/doc/${doc.id}`),
        onSettled: () => {
          setPendingCategory(null);
          setPickerOpen(false);
        },
      },
    );
  };

  /** Fetches full rows for the selected lists; the dashboard only holds counts. */
  const loadSelected = async () =>
    Promise.all(
      selected.map(async (id) => {
        const res = await fetch(buildUrl(api.documents.get.path, { id }));
        if (!res.ok) throw new Error("Could not load one of the selected lists");
        return api.documents.get.responses[200].parse(await res.json());
      }),
    );

  const handleBulkDownload = async () => {
    setBusy(true);
    try {
      const lists = await loadSelected();
      const withRows = lists.filter((list) => list.records.length > 0);

      if (withRows.length === 0) {
        toast({ variant: "destructive", description: "The selected lists have no records." });
        return;
      }

      // One .txt per list, staggered so browsers do not drop concurrent downloads.
      for (const list of withRows) {
        downloadTxt(list.name, list.records);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      toast({
        title: `Downloaded ${withRows.length} ${withRows.length === 1 ? "list" : "lists"}`,
        description: lists.length > withRows.length ? "Empty lists were skipped." : undefined,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Download failed", description: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleBulkShare = async () => {
    setBusy(true);
    try {
      const lists = await loadSelected();
      const payload = lists
        .map((list) => `${list.name} (${list.records.length} records)\n${buildTxt(list.records)}`)
        .join("\n\n");

      const how = await shareText(`${lists.length} Remaker lists`, payload);
      toast({ title: how === "shared" ? "Shared" : "Copied to clipboard" });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast({ variant: "destructive", title: "Share failed", description: String(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    const count = selected.length;
    deleteDocs.mutate(selected, {
      onSuccess: () => {
        setSelected([]);
        setConfirmDelete(false);
        toast({ title: `Deleted ${count} ${count === 1 ? "list" : "lists"}` });
      },
    });
  };

  const hasLists = (documents?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Decorative wash, kept well behind the content */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-[30%] -left-[10%] w-[55%] h-[55%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute top-[30%] -right-[15%] w-[45%] h-[45%] rounded-full bg-accent/5 blur-[110px]" />
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Masthead */}
        <header className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setLocation("/")}
              className="p-2.5 rounded-xl bg-primary/10 shrink-0 hover:bg-primary/15 transition-colors group relative"
              aria-label="Back to home"
            >
              <FileSpreadsheet className="w-6 h-6 text-primary group-hover:opacity-0 transition-opacity" />
              <ArrowLeft className="w-6 h-6 text-primary absolute inset-0 m-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <div>
              <h1 className="text-2xl md:text-[2rem] leading-tight font-bold font-display tracking-tight">
                All Lists
              </h1>
              <p className="text-sm text-muted-foreground">
                {hasLists ? (
                  <>
                    {documents!.length} {documents!.length === 1 ? "list" : "lists"}
                    <span className="mx-1.5 text-muted-foreground/40">·</span>
                    {totalRecords.toLocaleString()} {totalRecords === 1 ? "record" : "records"}
                  </>
                ) : (
                  "Audit records, verified and exported"
                )}
              </p>
            </div>
          </div>

          <Button
            size="lg"
            onClick={handleCreate}
            disabled={createDoc.isPending}
            className="shrink-0 shadow-lg shadow-primary/20"
          >
            {createDoc.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-5 w-5" />
            )}
            <span className="hidden sm:inline">New List</span>
            <span className="sm:hidden">New</span>
          </Button>
        </header>

        {/* Remake category filter */}
        {hasLists && (
          <div className="flex flex-wrap gap-2 mb-4">
            <CategoryChip
              label="All"
              count={documents!.length}
              active={category === "all"}
              onClick={() => setCategory("all")}
            />
            {REMAKE_CATEGORIES.map((c) => (
              <CategoryChip
                key={c.id}
                label={c.label}
                count={categoryCounts.get(c.id) ?? 0}
                active={category === c.id}
                onClick={() => setCategory(c.id)}
              />
            ))}
          </div>
        )}

        {/* Controls */}
        {(hasLists || search) && (
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by list name or ID..."
                className="pl-10 pr-10 h-11"
              />
              {search ? (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/60 border border-border/60 rounded px-1.5 py-0.5">
                  /
                </kbd>
              )}
            </div>

            <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
              <SelectTrigger className="h-11 sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Selection toolbar */}
        <AnimatePresence>
          {selected.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="sticky top-4 z-20 mb-5 flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-primary/25 bg-card/95 backdrop-blur shadow-lg"
            >
              <span className="text-sm font-medium px-2">{selected.length} selected</span>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleBulkDownload} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Download
              </Button>
              <Button size="sm" variant="outline" onClick={handleBulkShare} disabled={busy}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={deleteDocs.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result meta */}
        {!isLoading && visible.length > 0 && (
          <div className="flex items-center justify-between gap-3 mb-3 px-0.5 h-6">
            <p className="text-xs text-muted-foreground">
              {search
                ? `${visible.length} ${visible.length === 1 ? "match" : "matches"}`
                : `${visible.length} ${visible.length === 1 ? "list" : "lists"}`}
            </p>
            <button
              onClick={toggleAllVisible}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-5 rounded-2xl border border-border/60 bg-card">
                <Skeleton className="h-5 w-2/3 mb-3" />
                <Skeleton className="h-8 w-1/3 mb-4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            hasLists={hasLists}
            filtered={category !== "all" || !!search}
            categoryName={category === "all" ? null : categoryLabel(category)}
            onCreate={handleCreate}
            onClear={() => {
              setSearch("");
              setCategory("all");
            }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {visible.map((doc) => (
                <ListCard
                  key={doc.id}
                  doc={doc}
                  selected={selected.includes(doc.id)}
                  selectionActive={selected.length > 0}
                  onToggle={() => toggle(doc.id)}
                  onOpen={() => setLocation(`/doc/${doc.id}`)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <CategoryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleSelectCategory}
        pendingId={pendingCategory}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.length} {selected.length === 1 ? "list" : "lists"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the{" "}
              {selected.length === 1 ? "list and its records" : "lists and all their records"}. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ListCard({
  doc,
  selected,
  selectionActive,
  onToggle,
  onOpen,
}: {
  doc: DocumentSummary;
  selected: boolean;
  selectionActive: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const updated = formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "group relative rounded-2xl border bg-card transition-all duration-200",
        "hover:shadow-lg hover:-translate-y-0.5",
        selected ? "border-primary ring-2 ring-primary/20" : "border-border/60 hover:border-border",
      )}
    >
      {/* Checkbox stays out of the way until it is useful */}
      <div
        className={cn(
          "absolute top-4 right-4 z-10 transition-opacity",
          selected || selectionActive
            ? "opacity-100"
            : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${doc.name}`}
          className="bg-card"
        />
      </div>

      <button onClick={onOpen} className="text-left w-full p-5 block">
        <div className="flex items-center gap-2 mb-1.5 pr-8">
          {doc.auditPrefix && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-mono font-semibold tracking-widest">
              {doc.auditPrefix}
            </span>
          )}
          <h3 className="font-semibold text-lg font-display truncate group-hover:text-primary transition-colors">
            {doc.name}
          </h3>
        </div>

        <p className="text-[1.75rem] leading-none font-bold font-mono text-foreground/90 mb-3">
          {doc.recordCount.toLocaleString()}
          <span className="text-sm font-sans font-normal text-muted-foreground ml-1.5">
            {doc.recordCount === 1 ? "record" : "records"}
          </span>
        </p>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground truncate">
            <span className="text-foreground/70">{categoryLabel(doc.category)}</span>
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            {updated}
          </p>
          <ArrowRight className="w-4 h-4 text-muted-foreground/0 group-hover:text-primary transition-colors shrink-0" />
        </div>
      </button>
    </motion.div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
          : "border-border/60 bg-card text-muted-foreground hover:text-foreground hover:border-border",
      )}
    >
      {label}
      <span
        className={cn(
          "text-[11px] font-mono tabular-nums",
          active ? "text-primary-foreground/70" : "text-muted-foreground/60",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function EmptyState({
  hasLists,
  filtered,
  categoryName,
  onCreate,
  onClear,
}: {
  hasLists: boolean;
  filtered: boolean;
  categoryName: string | null;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 md:py-28 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-5">
        {hasLists ? (
          <Search className="w-7 h-7 opacity-25" />
        ) : (
          <FileSpreadsheet className="w-7 h-7 opacity-25" />
        )}
      </div>

      {hasLists && filtered ? (
        <>
          <p className="font-medium mb-1">
            {categoryName ? `No ${categoryName} lists yet.` : "No lists match your search."}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            {categoryName
              ? "Create one, or show every category."
              : "Try a different name or list ID."}
          </p>
          <div className="flex gap-2">
            <Button onClick={onCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New List
            </Button>
            <Button variant="outline" onClick={onClear}>
              Show all
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-lg font-medium font-display mb-1">No lists yet</p>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            Create a list to start entering audit numbers. Record ID, Box ID and Whitelist are
            filled in for you.
          </p>
          <Button size="lg" onClick={onCreate} className="shadow-lg shadow-primary/20">
            <Plus className="mr-2 h-5 w-5" />
            Create your first list
          </Button>
        </>
      )}
    </div>
  );
}
