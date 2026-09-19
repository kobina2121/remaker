import type { AuditRecord } from "@shared/schema";

/**
 * Job line written as the first line of every exported file. The escapes
 * produce two literal backslashes in each place: FILEMK\\REMAKE JOB NID_RMK\\
 */
export const FILE_HEADER = "FILEMK\\\\REMAKE JOB NID_RMK\\\\";

/**
 * Export layout: the job line, then one record per line with a single space
 * between fields and no column headings:
 *
 *   FILEMK\\REMAKE JOB NID_RMK\\
 *   0178 000692 12345678 AM399G_600105483_20170811.xml
 *
 * Column order: record_id, box_id, audit_no, whitelist.
 */
export function buildTxt(records: AuditRecord[]): string {
  const lines = records.map((r) => [r.recordId, r.boxId, r.auditNo, r.whitelist].join(" "));
  return [FILE_HEADER, ...lines].join("\n");
}

/** Turns a list name into a safe filename. */
export function exportFilename(name: string): string {
  const safe = name.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe || "Untitled_List"}.txt`;
}

export function downloadTxt(name: string, records: AuditRecord[]): void {
  const blob = new Blob([buildTxt(records)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = exportFilename(name);
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

/**
 * Native share where the browser supports it, clipboard otherwise.
 * Returns how the content was delivered so the caller can word its toast.
 */
export async function shareText(title: string, text: string): Promise<"shared" | "copied"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch (err) {
      // The user dismissing the share sheet is not a failure worth falling back on.
      if (err instanceof DOMException && err.name === "AbortError") throw err;
    }
  }

  await navigator.clipboard.writeText(text);
  return "copied";
}
