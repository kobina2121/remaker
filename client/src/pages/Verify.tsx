import { useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileUp, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildVerificationReport,
  groupIssues,
  issueLabel,
  verifyExportText,
  type VerifyReport,
} from "@shared/verify";

/** Issues shown per group before collapsing into a "and N more" line. */
const MAX_SHOWN = 50;

export default function Verify() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    setChecking(true);
    setReport(null);
    try {
      const text = await file.text();
      // Let the spinner paint before the check runs on a large file.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = verifyExportText(text, file.name);

      if (result.recordCount === 0) {
        toast({
          variant: "destructive",
          title: "Nothing to check",
          description: "That file has no records in it.",
        });
        setChecking(false);
        return;
      }
      setReport(result);
    } catch {
      toast({ variant: "destructive", title: "Could not read that file", description: "Please choose a .csv or .txt file." });
    } finally {
      setChecking(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([buildVerificationReport(report)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.fileName.replace(/\.[^.]+$/, "")}_verification.txt`;
    window.document.body.appendChild(anchor);
    anchor.click();
    window.document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <header className="flex items-center gap-3 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold font-display tracking-tight">
              Milling &amp; Embedding Verification
            </h1>
            <p className="text-sm text-muted-foreground">
              Upload the file received from QC. Every Record ID and Box ID is recalculated from its
              audit number and compared with the file.
            </p>
          </div>
        </header>

        {/* Upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "rounded-2xl border-2 border-dashed p-8 md:p-12 text-center transition-colors bg-card",
            dragging ? "border-primary bg-primary/[0.03]" : "border-border",
          )}
        >
          <input ref={inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onPick} className="hidden" />

          {checking ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p>Checking the file...</p>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <FileUp className="w-7 h-7 opacity-30" />
              </div>
              <p className="font-medium mb-1">Drop the file here, or choose it</p>
              <p className="text-sm text-muted-foreground mb-5">
                Accepts the .csv or .txt exported by Remaker, with or without the job line,
                separated by spaces, tabs or commas.
              </p>
              <Button onClick={() => inputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Choose file
              </Button>
            </>
          )}
        </div>

        {report && <Result report={report} onDownload={downloadReport} onAnother={() => setReport(null)} />}
      </div>
    </div>
  );
}

function Result({
  report,
  onDownload,
  onAnother,
}: {
  report: VerifyReport;
  onDownload: () => void;
  onAnother: () => void;
}) {
  const groups = groupIssues(report.issues);

  return (
    <div className="mt-6 space-y-6">
      {/* Verdict */}
      <div
        className={cn(
          "rounded-2xl border p-5 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4",
          report.passed ? "border-green-600/30 bg-green-600/5" : "border-destructive/30 bg-destructive/5",
        )}
      >
        {report.passed ? (
          <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />
        ) : (
          <AlertCircle className="w-8 h-8 text-destructive shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h2 className={cn("text-xl font-display", report.passed ? "text-green-700" : "text-destructive")}>
            {report.passed ? "Verified - no errors found" : `${report.issues.length.toLocaleString()} problem${report.issues.length === 1 ? "" : "s"} found`}
          </h2>
          <p className="text-sm text-muted-foreground truncate">
            {report.fileName} · {report.checkedCount.toLocaleString()} records checked
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onAnother}>
            Check another
          </Button>
          <Button onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            Save report
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Fact label="Records checked" value={report.checkedCount.toLocaleString()} />
        <Fact
          label="Audit range"
          value={report.firstAudit ? `${report.firstAudit} – ${report.lastAudit}` : "—"}
          mono
        />
        <Fact label="Job line" value={report.jobLine ? "present" : "not present"} />
        <Fact
          label="Whitelist"
          value={report.whitelists.length === 1 ? report.whitelists[0] : `${report.whitelists.length} different`}
          mono
        />
      </div>

      {report.missingCount > 0 && (
        <p className="text-sm text-muted-foreground px-1">
          {report.missingCount.toLocaleString()} audit numbers between {report.firstAudit} and{" "}
          {report.lastAudit} are not in this file. That is only a problem if this file is meant to be
          a continuous range.
        </p>
      )}

      {/* Problems, grouped the way the analyzer reports them */}
      {groups.map((group) => (
        <div key={group.type} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 bg-destructive/5 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <h3 className="text-sm text-destructive">
              {issueLabel(group.type)} ({group.items.length.toLocaleString()})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 w-20 font-medium">Line</th>
                  <th className="p-3 font-medium min-w-[9rem]">Audit No</th>
                  <th className="p-3 font-medium">In the file</th>
                  <th className="p-3 font-medium">Should be</th>
                </tr>
              </thead>
              <tbody>
                {group.items.slice(0, MAX_SHOWN).map((issue, i) => (
                  <tr key={`${issue.line}-${i}`} className="border-b border-border/30 last:border-0">
                    <td className="p-3 font-mono text-xs text-muted-foreground">{issue.line}</td>
                    <td className="p-3 font-mono">{issue.auditNo || "—"}</td>
                    <td className="p-3 font-mono text-destructive">{issue.found}</td>
                    <td className="p-3 font-mono">{issue.expected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {group.items.length > MAX_SHOWN && (
            <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border/40">
              Showing the first {MAX_SHOWN} of {group.items.length.toLocaleString()}. Save the report
              for the full list.
            </p>
          )}
        </div>
      ))}

      {report.warnings.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="text-sm mb-2">Notes</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            {report.warnings.slice(0, 10).map((warning, i) => (
              <li key={i}>{warning.detail}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("truncate", mono && "font-mono text-xs")} title={value}>
        {value}
      </p>
    </div>
  );
}
