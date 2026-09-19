import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { useDocument, useUpdateDocument, useSaveRecords, ApiError } from "@/hooks/use-remaker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Loader2,
  Save,
  Check,
  Share2,
  Tag,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  AUDIT_DIGITS,
  AUDIT_PREFIX_LENGTH,
  DEFAULT_WHITELIST,
  MAX_RANGE_SIZE,
  deriveBoxId,
  deriveRecordId,
  deriveRow,
  applyPrefix,
  formatAuditNo,
  isValidAuditNo,
  parseAuditNo,
  sanitizeAuditInput,
  sanitizePrefixInput,
  splitAuditNo,
} from "@shared/audit";
import type { AuditRecord } from "@shared/schema";
import { buildTxt, downloadTxt, shareText } from "@/lib/export";
import { REMAKE_CATEGORIES, categoryLabel, DEFAULT_CATEGORY } from "@shared/categories";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MIN_ROWS = 10;
const ROWS_PER_PAGE = 100;

type Row = { auditNo: string; recordId: string; boxId: string; whitelist: string };

const blankRow = (): Row => ({ auditNo: "", recordId: "", boxId: "", whitelist: "" });

/** A row with no digits is empty, even when it already shows the list prefix. */
const isBlank = (row: Row) => !/\d/.test(row.auditNo);

type RowCheck = { blank: boolean; problem: string | null; audit: string; key: string };

/**
 * Per-row checks, cached by row object. Rows are never mutated - an edit swaps
 * in a new object for the edited row only - so on a keystroke every other row is
 * a cache hit and skips the regex and string work. Without this, typing in a
 * 50,000-row list re-checked all 50,000 rows per key and visibly lagged.
 */
const rowChecks = new WeakMap<Row, RowCheck>();

function checkRow(row: Row): RowCheck {
  const cached = rowChecks.get(row);
  if (cached) return cached;

  const blank = isBlank(row);
  const audit = row.auditNo.trim();
  let problem: string | null = null;
  if (!blank) {
    if (!isValidAuditNo(audit)) {
      problem = `Audit number must be ${AUDIT_DIGITS} digits, optionally led by ${AUDIT_PREFIX_LENGTH} letters`;
    } else if (!row.recordId.trim() || !row.boxId.trim() || !row.whitelist.trim()) {
      problem = "Record ID, Box ID and Whitelist cannot be empty";
    }
  }

  const check = { blank, problem, audit, key: `${row.recordId.trim()}-${row.boxId.trim()}` };
  rowChecks.set(row, check);
  return check;
}

/** Format problems and duplicates across the whole list, keyed by row index. */
function validateRows(rows: Row[]): Map<number, string> {
  const problems = new Map<number, string>();
  const auditAt = new Map<string, number>();
  const keyAt = new Map<string, number>();

  for (let index = 0; index < rows.length; index++) {
    const check = checkRow(rows[index]);
    if (check.blank) continue;
    if (check.problem) {
      problems.set(index, check.problem);
      continue;
    }

    const priorAudit = auditAt.get(check.audit);
    if (priorAudit !== undefined) {
      problems.set(index, `Duplicate audit number (row ${priorAudit + 1})`);
      continue;
    }
    auditAt.set(check.audit, index);

    const priorKey = keyAt.get(check.key);
    if (priorKey !== undefined) {
      problems.set(index, `Duplicate Record ID / Box ID (row ${priorKey + 1})`);
      continue;
    }
    keyAt.set(check.key, index);
  }

  return problems;
}

const filledRows = (rows: Row[]) => rows.filter((row) => !checkRow(row).blank);

/** Pads out to MIN_ROWS and guarantees one trailing blank row to type into. */
function withTrailingBlank(rows: Row[]): Row[] {
  const next = [...rows];
  while (next.length < MIN_ROWS) next.push(blankRow());
  if (next.length === 0 || !isBlank(next[next.length - 1])) next.push(blankRow());
  return next;
}

export default function ListEditor() {
  const [match, params] = useRoute("/doc/:id");
  const id = params?.id ?? "";

  const { data: document, isLoading } = useDocument(id);
  const updateDoc = useUpdateDocument();
  const saveRecords = useSaveRecords();
  const { toast } = useToast();

  const [rows, setRows] = useState<Row[]>(() => withTrailingBlank([]));
  const [page, setPage] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [prefixDraft, setPrefixDraft] = useState("");
  const [auditPrefix, setAuditPrefix] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [serverRows, setServerRows] = useState<number[]>([]);
  const loadedId = useRef<string | null>(null);

  const whitelist = document?.whitelist ?? DEFAULT_WHITELIST;

  const category = document?.category ?? DEFAULT_CATEGORY;

  // Load saved rows once per list (re-fetches must not clobber unsaved edits).
  useEffect(() => {
    if (!document || loadedId.current === document.id) return;
    loadedId.current = document.id;
    setRows(withTrailingBlank(document.records.map((r) => ({ ...r }))));
    setPrefixDraft(document.auditPrefix ?? "");
    setAuditPrefix(document.auditPrefix ?? "");
    setDirty(false);
  }, [document]);

  // The whole-list duplicate scan runs just after each keystroke instead of
  // during it, so typing stays instant; highlights follow a moment later.
  // Save / Download / Share re-check the current rows when clicked.
  const checkedRows = useDeferredValue(rows);
  const filled = useMemo(() => filledRows(checkedRows), [checkedRows]);
  const errors = useMemo(() => validateRows(checkedRows), [checkedRows]);

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
      return withTrailingBlank(next);
    });
    setDirty(true);
    setServerRows([]);
  };

  /** Typing an audit number regenerates the three derived columns. */
  const handleAuditChange = (index: number, raw: string) => {
    const typed = sanitizeAuditInput(raw);

    if (!typed) {
      updateRow(index, blankRow());
      return;
    }

    // Typing digits only adopts the list's prefix; typing letters overrides it.
    const { prefix, digits } = splitAuditNo(typed);
    if (!digits) {
      updateRow(index, { ...blankRow(), auditNo: prefix });
      return;
    }
    const auditNo = (prefix || auditPrefix) + digits;

    const derived = deriveRow(auditNo, whitelist);
    updateRow(
      index,
      derived
        ? { auditNo, recordId: derived.recordId, boxId: derived.boxId, whitelist: derived.whitelist }
        : { auditNo },
    );
  };

  /** An empty Audit_No cell shows the list prefix as soon as it is focused. */
  const handleAuditFocus = (index: number) => {
    if (!auditPrefix) return;
    setRows((prev) => prev.map((row, i) => (i === index && !row.auditNo ? { ...row, auditNo: auditPrefix } : row)));
  };

  /** A cell left holding only letters goes back to empty. */
  const handleAuditBlur = (index: number) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index && row.auditNo && isBlank(row) ? blankRow() : row)),
    );
  };

  /**
   * The prefix is a property of the list, so changing it rewrites the letters on
   * every existing row. The digits, and therefore Record/Box IDs, are untouched.
   */
  const commitPrefix = () => {
    const next = sanitizePrefixInput(prefixDraft);

    if (next.length > 0 && next.length < AUDIT_PREFIX_LENGTH) {
      setPrefixDraft(auditPrefix);
      toast({
        variant: "destructive",
        title: `Prefix must be ${AUDIT_PREFIX_LENGTH} letters`,
        description: "Enter two letters, or leave it empty for digits only.",
      });
      return;
    }

    setPrefixDraft(next);
    if (next === auditPrefix) return;
    setAuditPrefix(next);
    updateDoc.mutate({ id, auditPrefix: next });

    const affected = rows.filter((row) => !isBlank(row)).length;
    if (affected > 0) {
      setRows((prev) =>
        withTrailingBlank(
          prev.map((row) => (isBlank(row) ? row : { ...row, auditNo: applyPrefix(row.auditNo, next) })),
        ),
      );
      setDirty(true);
      setServerRows([]);
    }

    toast({
      title: next ? `Prefix set to ${next}` : "Prefix removed",
      description:
        affected > 0
          ? `Applied to ${affected.toLocaleString()} ${affected === 1 ? "row" : "rows"}. Save All to keep the change.`
          : "New rows will use this prefix.",
    });
  };

  const handleApplyRange = () => {
    setRangeError(null);

    const start = parseAuditNo(rangeStart);
    const end = parseAuditNo(rangeEnd);

    if (start === null || end === null) {
      setRangeError(
        `Enter ${AUDIT_DIGITS} digits for both, optionally led by ${AUDIT_PREFIX_LENGTH} letters (e.g. ${auditPrefix || "AA"}00000001)`,
      );
      return;
    }

    // Letters typed into the range win over the list prefix; if both ends carry
    // letters they must agree, since one range cannot straddle two prefixes.
    const startLetters = splitAuditNo(rangeStart).prefix;
    const endLetters = splitAuditNo(rangeEnd).prefix;
    if (startLetters && endLetters && startLetters !== endLetters) {
      setRangeError(`Start and end use different letters (${startLetters} / ${endLetters})`);
      return;
    }
    const rangePrefix = startLetters || endLetters || auditPrefix;
    if (end < start) {
      setRangeError("End audit number must not be lower than the start");
      return;
    }

    const size = end - start + 1;
    if (size > MAX_RANGE_SIZE) {
      setRangeError(`That range is ${size.toLocaleString()} records. The maximum per apply is ${MAX_RANGE_SIZE.toLocaleString()}.`);
      return;
    }

    // Existing audit numbers are never overwritten or duplicated.
    const existing = new Set(rows.filter((r) => !isBlank(r)).map((r) => r.auditNo.trim()));
    const generated: Row[] = [];

    for (let value = start; value <= end; value++) {
      const auditNo = formatAuditNo(value, rangePrefix);
      if (existing.has(auditNo)) continue;
      // Derive from the number we already have rather than re-parsing the text.
      generated.push({ auditNo, recordId: deriveRecordId(value), boxId: deriveBoxId(value), whitelist });
    }

    if (generated.length === 0) {
      setRangeError("Every audit number in that range is already in this list");
      return;
    }

    setRows((prev) => {
      const next = [...prev];
      let cursor = 0;

      // Fill blank rows first, then append the remainder.
      for (const row of generated) {
        while (cursor < next.length && !isBlank(next[cursor])) cursor++;
        if (cursor < next.length) next[cursor] = row;
        else next.push(row);
      }
      return withTrailingBlank(next);
    });

    setDirty(true);
    setServerRows([]);
    const skipped = size - generated.length;
    toast({
      title: `Generated ${generated.length.toLocaleString()} ${generated.length === 1 ? "record" : "records"}`,
      description: skipped > 0 ? `${skipped.toLocaleString()} already in the list were skipped.` : undefined,
    });
  };

  const handleSave = () => {
    const errors = validateRows(rows);
    const filled = filledRows(rows);
    if (errors.size > 0) {
      const firstRow = Math.min(...Array.from(errors.keys())) + 1;
      toast({
        variant: "destructive",
        title: "Fix errors before saving",
        description: `${errors.size} ${errors.size === 1 ? "row has" : "rows have"} a problem, starting at row ${firstRow}.`,
      });
      setPage(Math.floor((firstRow - 1) / ROWS_PER_PAGE));
      return;
    }

    const records: AuditRecord[] = filled.map((row) => ({
      auditNo: row.auditNo.trim(),
      recordId: row.recordId.trim(),
      boxId: row.boxId.trim(),
      whitelist: row.whitelist.trim(),
    }));

    saveRecords.mutate(
      { id, records },
      {
        onSuccess: () => {
          setDirty(false);
          setServerRows([]);
          toast({ title: "Saved", description: `${records.length.toLocaleString()} ${records.length === 1 ? "record" : "records"} saved.` });
        },
        onError: (error) => {
          // The server reports which rows it rejected so they can be highlighted.
          const rows = error instanceof ApiError ? error.rows : undefined;
          setServerRows(rows ?? []);
          toast({ variant: "destructive", title: "Save failed", description: error.message });
        },
      },
    );
  };

  const handleClearAll = () => {
    setRows(withTrailingBlank([]));
    setDirty(true);
    setServerRows([]);
    setPage(0);
    setConfirmClear(false);
    toast({ title: "All rows cleared", description: "Save to make this permanent." });
  };

  const handleDownload = () => {
    const filled = filledRows(rows);
    if (filled.length === 0) {
      toast({ variant: "destructive", description: "This list has no records to download." });
      return;
    }
    downloadTxt(document?.name ?? "Untitled List", filled as AuditRecord[]);
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const handleShare = async () => {
    const filled = filledRows(rows);
    if (filled.length === 0) {
      toast({ variant: "destructive", description: "This list has no records to share." });
      return;
    }
    try {
      const how = await shareText(document?.name ?? "Remaker list", buildTxt(filled as AuditRecord[]));
      toast({ title: how === "shared" ? "Shared" : "Copied to clipboard" });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast({ variant: "destructive", title: "Share failed", description: "Could not share this list." });
    }
  };

  const handleRename = (e: React.FocusEvent<HTMLInputElement>) => {
    const name = e.target.value.trim();
    if (name && document && name !== document.name) updateDoc.mutate({ id, name });
  };

  if (!match || !id) return <div className="p-8">Invalid URL</div>;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <h2 className="text-2xl font-bold text-destructive">List not found</h2>
        <Link href="/lists">
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to lists</Button>
        </Link>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * ROWS_PER_PAGE;
  const pageRows = rows.slice(pageStart, pageStart + ROWS_PER_PAGE);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {/* Header */}
        <header className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/lists">
              <Button variant="ghost" size="icon" className="rounded-full shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="inline-flex items-center gap-1.5 ml-0.5 mb-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold tracking-wide hover:bg-primary/15 transition-colors"
                    title="Change remake type"
                  >
                    <Tag className="w-3 h-3" />
                    {categoryLabel(category)} Remake
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Remake type</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {REMAKE_CATEGORIES.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onSelect={() => {
                        if (c.id !== category) updateDoc.mutate({ id, category: c.id });
                      }}
                      className="gap-2"
                    >
                      <Check
                        className={cn("w-4 h-4", c.id === category ? "opacity-100" : "opacity-0")}
                      />
                      {c.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                type="text"
                defaultValue={document.name}
                onBlur={handleRename}
                className="bg-transparent text-2xl md:text-3xl font-bold font-display focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg px-2 -ml-2 w-full transition-all hover:bg-muted/50"
              />
              <div className="text-sm text-muted-foreground px-2 flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full", dirty ? "bg-yellow-400" : "bg-green-500")} />
                {dirty ? "Unsaved changes" : "All changes saved"}
                <span className="text-muted-foreground/50">·</span>
                {filled.length.toLocaleString()} {filled.length === 1 ? "record" : "records"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSave} disabled={saveRecords.isPending || !dirty} className="shadow-lg shadow-primary/20">
              {saveRecords.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save All
            </Button>
            <Button variant="outline" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button variant="outline" onClick={handleShare}>
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" onClick={() => setConfirmClear(true)} className="text-destructive hover:text-destructive">
              <Eraser className="mr-2 h-4 w-4" />
              Clear All
            </Button>
          </div>
        </header>

        {/* Audit prefix */}
        <div className="mb-4 p-4 md:p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Type className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Audit Prefix</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="sm:w-40">
              <label className="text-xs text-muted-foreground mb-1 block">Letters (optional)</label>
              <Input
                value={prefixDraft}
                onChange={(e) => setPrefixDraft(sanitizePrefixInput(e.target.value))}
                onBlur={commitPrefix}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                placeholder="AA"
                maxLength={AUDIT_PREFIX_LENGTH}
                className="font-mono text-lg tracking-[0.3em] uppercase"
                aria-label="Audit number prefix"
              />
            </div>
            <p className="text-sm text-muted-foreground flex-1 pb-2">
              Two letters placed in front of every audit number in this list, e.g.{" "}
              <span className="font-mono text-foreground">
                {(prefixDraft || "AA")}00000001
              </span>
              . Leave blank for digits only. You can also type letters straight into an Audit_No
              cell or the range fields. Record ID and Box ID come from the digits alone.
            </p>
          </div>
        </div>

        {/* Range generator */}
        <div className="mb-6 p-4 md:p-5 rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-semibold">Audit Range Generator</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">Start Audit No.</label>
              <Input
                value={rangeStart}
                onChange={(e) => setRangeStart(sanitizeAuditInput(e.target.value))}
                onFocus={() => !rangeStart && auditPrefix && setRangeStart(auditPrefix)}
                onBlur={() => !/\d/.test(rangeStart) && setRangeStart("")}
                placeholder={`${auditPrefix}00000001`}
                className="font-mono"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">End Audit No.</label>
              <Input
                value={rangeEnd}
                onChange={(e) => setRangeEnd(sanitizeAuditInput(e.target.value))}
                onFocus={() => !rangeEnd && auditPrefix && setRangeEnd(auditPrefix)}
                onBlur={() => !/\d/.test(rangeEnd) && setRangeEnd("")}
                placeholder={`${auditPrefix}00000500`}
                className="font-mono"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
            <Button onClick={handleApplyRange} className="sm:w-32">
              Apply
            </Button>
          </div>
          <AnimatePresence>
            {rangeError && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-destructive text-sm mt-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {rangeError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Error summary */}
        {errors.size > 0 && (
          <div className="mb-4 p-3 rounded-xl border border-destructive/30 bg-destructive/5 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errors.size} {errors.size === 1 ? "row needs" : "rows need"} attention before saving.
          </div>
        )}

        {/* Grid */}
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border/60">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 w-14 text-right font-medium">#</th>
                  <th className="p-3 font-medium min-w-[7rem]">Record_ID</th>
                  <th className="p-3 font-medium min-w-[7rem]">Box_ID</th>
                  <th className="p-3 font-medium min-w-[9rem]">Audit_No</th>
                  <th className="p-3 font-medium min-w-[16rem]">Whitelist</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => {
                  const index = pageStart + i;
                  const error = errors.get(index);
                  const flagged = serverRows.includes(index + 1);

                  return (
                    <tr
                      key={index}
                      className={cn(
                        "border-b border-border/30 transition-colors",
                        error || flagged ? "bg-destructive/5" : "hover:bg-muted/20",
                      )}
                      title={error}
                    >
                      <td className="p-2 text-right text-xs text-muted-foreground font-mono align-middle">
                        {index + 1}
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.recordId}
                          onChange={(e) => updateRow(index, { recordId: e.target.value })}
                          className="h-9 font-mono"
                          disabled={isBlank(row)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.boxId}
                          onChange={(e) => updateRow(index, { boxId: e.target.value })}
                          className="h-9 font-mono"
                          disabled={isBlank(row)}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.auditNo}
                          onChange={(e) => handleAuditChange(index, e.target.value)}
                          onFocus={() => handleAuditFocus(index)}
                          onBlur={() => handleAuditBlur(index)}
                          placeholder={`${auditPrefix}00000000`}
                          autoComplete="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          className={cn(
                            "h-9 font-mono tracking-wide",
                            (error || flagged) && "border-destructive focus-visible:ring-destructive/20",
                          )}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={row.whitelist}
                          onChange={(e) => updateRow(index, { whitelist: e.target.value })}
                          className="h-9 font-mono text-xs"
                          disabled={isBlank(row)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {errors.size > 0 && (
            <div className="px-4 py-2 border-t border-border/40 bg-destructive/5 text-xs text-destructive space-y-1">
              {Array.from(errors.entries())
                .filter(([index]) => index >= pageStart && index < pageStart + ROWS_PER_PAGE)
                .slice(0, 5)
                .map(([index, message]) => (
                  <div key={index}>Row {index + 1}: {message}</div>
                ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t border-border/40 bg-muted/20">
              <span className="text-xs text-muted-foreground">
                Rows {pageStart + 1}-{Math.min(pageStart + ROWS_PER_PAGE, rows.length)} of {rows.length.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentPage + 1} / {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all rows?</AlertDialogTitle>
            <AlertDialogDescription>
              This empties every row in the editor. The saved copy is only replaced once you press Save All.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
