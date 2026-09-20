import {
  AUDIT_DIGITS,
  AUDIT_PREFIX_LENGTH,
  deriveBoxId,
  deriveRecordId,
  parseAuditNo,
} from "./audit";

/**
 * Milling & Embedding verification.
 *
 * Re-derives Record ID and Box ID from each audit number in an exported file
 * and compares them with what the file actually contains, the same checks the
 * Whitelist Analyzer reports as "RECORD ID ERRORS" / "BOX ID ERRORS".
 *
 * The file is checked on its own: no saved list is required.
 */

export type VerifyIssueType =
  | "record-id"
  | "box-id"
  | "audit-number"
  | "line-format"
  | "duplicate-audit"
  | "duplicate-record-box";

export type VerifyIssue = {
  type: VerifyIssueType;
  /** 1-based line number in the uploaded file, so the row is easy to find. */
  line: number;
  auditNo: string;
  found: string;
  expected: string;
  detail: string;
};

export type VerifyWarning = { line: number; auditNo: string; detail: string };

export type VerifyReport = {
  fileName: string;
  jobLine: string | null;
  /** Lines that parsed into four fields. */
  recordCount: number;
  checkedCount: number;
  issues: VerifyIssue[];
  warnings: VerifyWarning[];
  passed: boolean;
  firstAudit: string | null;
  lastAudit: string | null;
  /** Audit numbers not present between the lowest and highest in the file. */
  missingCount: number;
  whitelists: string[];
  separator: "space" | "tab" | "mixed" | "unknown";
};

const ISSUE_LABELS: Record<VerifyIssueType, string> = {
  "record-id": "Record ID errors",
  "box-id": "Box ID errors",
  "audit-number": "Invalid audit numbers",
  "line-format": "Malformed lines",
  "duplicate-audit": "Duplicate audit numbers",
  "duplicate-record-box": "Duplicate Record ID / Box ID",
};

export function issueLabel(type: VerifyIssueType): string {
  return ISSUE_LABELS[type];
}

/** A job line such as FILEMK\\REMAKE JOB NID_RMK\\ rather than a record. */
function isJobLine(fields: string[]): boolean {
  return fields.length < 4 || /^FILEMK/i.test(fields[0]);
}

/**
 * Compares two id strings numerically so a file padded to five digits (00050)
 * still matches a six-digit expectation (000050); padding-only differences are
 * reported as warnings instead of errors.
 */
function sameNumber(found: string, expected: string): boolean {
  return /^\d+$/.test(found) && Number(found) === Number(expected);
}

export function verifyExportText(text: string, fileName = "uploaded file"): VerifyReport {
  const issues: VerifyIssue[] = [];
  const warnings: VerifyWarning[] = [];
  const whitelists = new Set<string>();
  const auditAt = new Map<string, number>();
  const keyAt = new Map<string, number>();

  let jobLine: string | null = null;
  let recordCount = 0;
  let checkedCount = 0;
  let firstAudit: string | null = null;
  let lastAudit: string | null = null;
  let sawTab = false;
  let sawSpace = false;
  const auditValues: number[] = [];

  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = i + 1;
    if (!raw.trim()) continue;

    if (raw.includes("\t")) sawTab = true;
    else if (/\S[ ,]\S/.test(raw.trim())) sawSpace = true;

    // Tolerant of spaces, tabs or commas between fields.
    const fields = raw.trim().split(/[\t ,]+/);

    // The job line is kept aside; everything else must be a four-field record.
    if (isJobLine(fields)) {
      if (jobLine === null && fields.length < 4) {
        jobLine = raw.trim();
        continue;
      }
      if (/^FILEMK/i.test(fields[0])) {
        jobLine = raw.trim();
        continue;
      }
    }

    if (fields.length !== 4) {
      recordCount++;
      issues.push({
        type: "line-format",
        line,
        auditNo: fields[2] ?? "",
        found: `${fields.length} fields`,
        expected: "4 fields",
        detail: `Line ${line} has ${fields.length} fields; expected Record ID, Box ID, Audit No and Whitelist`,
      });
      continue;
    }

    const [recordId, boxId, auditNo, whitelist] = fields;
    recordCount++;
    whitelists.add(whitelist);

    // Header row from an older export, e.g. "record_id box_id audit_no whitelist".
    if (/^record[_ ]?id$/i.test(recordId)) {
      recordCount--;
      warnings.push({ line, auditNo: "", detail: `Line ${line} looks like a column heading and was skipped` });
      continue;
    }

    const audit = parseAuditNo(auditNo);
    if (audit === null) {
      issues.push({
        type: "audit-number",
        line,
        auditNo,
        found: auditNo,
        expected: `${AUDIT_DIGITS} digits, optionally led by ${AUDIT_PREFIX_LENGTH} letters`,
        detail: `Line ${line}: "${auditNo}" is not a valid audit number`,
      });
      continue;
    }

    checkedCount++;
    auditValues.push(audit);
    if (firstAudit === null) firstAudit = auditNo;
    lastAudit = auditNo;

    const expectedRecord = deriveRecordId(audit);
    const expectedBox = deriveBoxId(audit);

    if (recordId !== expectedRecord) {
      if (sameNumber(recordId, expectedRecord)) {
        warnings.push({ line, auditNo, detail: `Record ID ${recordId} is padded differently from ${expectedRecord}` });
      } else {
        issues.push({
          type: "record-id",
          line,
          auditNo,
          found: recordId,
          expected: expectedRecord,
          detail: `Line ${line}: Record ID is ${recordId}, should be ${expectedRecord}`,
        });
      }
    }

    if (boxId !== expectedBox) {
      if (sameNumber(boxId, expectedBox)) {
        warnings.push({ line, auditNo, detail: `Box ID ${boxId} is padded differently from ${expectedBox}` });
      } else {
        issues.push({
          type: "box-id",
          line,
          auditNo,
          found: boxId,
          expected: expectedBox,
          detail: `Line ${line}: Box ID is ${boxId}, should be ${expectedBox}`,
        });
      }
    }

    const priorAudit = auditAt.get(auditNo);
    if (priorAudit !== undefined) {
      issues.push({
        type: "duplicate-audit",
        line,
        auditNo,
        found: auditNo,
        expected: "unique",
        detail: `Line ${line}: audit number ${auditNo} already appears on line ${priorAudit}`,
      });
    } else {
      auditAt.set(auditNo, line);
    }

    const key = `${recordId}-${boxId}`;
    const priorKey = keyAt.get(key);
    if (priorKey !== undefined) {
      issues.push({
        type: "duplicate-record-box",
        line,
        auditNo,
        found: key.replace("-", " / "),
        expected: "unique",
        detail: `Line ${line}: Record ID ${recordId} / Box ID ${boxId} already appears on line ${priorKey}`,
      });
    } else {
      keyAt.set(key, line);
    }
  }

  // Numbers absent between the lowest and highest audit number. Stated plainly:
  // a file that is not a continuous range is not wrong, so this is information only.
  let missingCount = 0;
  if (auditValues.length > 1) {
    // A loop, not Math.min(...values): spreading a large array overflows the stack.
    let min = auditValues[0];
    let max = auditValues[0];
    for (const value of auditValues) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const span = max - min + 1;
    if (span >= auditValues.length) missingCount = span - new Set(auditValues).size;
  }

  return {
    fileName,
    jobLine,
    recordCount,
    checkedCount,
    issues,
    warnings,
    passed: issues.length === 0 && checkedCount > 0,
    firstAudit,
    lastAudit,
    missingCount,
    whitelists: Array.from(whitelists),
    separator: sawTab && sawSpace ? "mixed" : sawTab ? "tab" : sawSpace ? "space" : "unknown",
  };
}

/** Groups issues by kind, in the order the analyzer reports them. */
export function groupIssues(issues: VerifyIssue[]): { type: VerifyIssueType; items: VerifyIssue[] }[] {
  const order: VerifyIssueType[] = [
    "record-id",
    "box-id",
    "audit-number",
    "duplicate-audit",
    "duplicate-record-box",
    "line-format",
  ];
  return order
    .map((type) => ({ type, items: issues.filter((issue) => issue.type === type) }))
    .filter((group) => group.items.length > 0);
}

/** Plain-text report M&E can save or send back. */
export function buildVerificationReport(report: VerifyReport, verifiedAt = new Date()): string {
  const lines: string[] = [
    "Milling & Embedding Verification Report",
    `File: ${report.fileName}`,
    `Checked: ${verifiedAt.toLocaleString()}`,
    `Result: ${report.passed ? "PASSED - all Record IDs and Box IDs are correct" : "FAILED"}`,
    "",
    `Records checked: ${report.checkedCount}`,
    report.firstAudit ? `Audit range: ${report.firstAudit} - ${report.lastAudit}` : "",
    report.missingCount > 0 && report.firstAudit
      ? `Numbers not present between ${report.firstAudit} and ${report.lastAudit}: ${report.missingCount} (only a problem if this file should be a continuous range)`
      : "",
    report.jobLine ? `Job line: ${report.jobLine}` : "Job line: (none)",
    "",
  ].filter(Boolean);

  for (const group of groupIssues(report.issues)) {
    lines.push("=".repeat(52), issueLabel(group.type).toUpperCase(), "=".repeat(52));
    for (const issue of group.items) {
      lines.push(
        `Audit Number: ${issue.auditNo || "(none)"}`,
        `Line: ${issue.line}`,
        `Found: ${issue.found}`,
        `Expected: ${issue.expected}`,
        "",
      );
    }
  }

  if (report.warnings.length > 0) {
    lines.push("=".repeat(52), "WARNINGS", "=".repeat(52));
    for (const warning of report.warnings) lines.push(warning.detail);
    lines.push("");
  }

  if (report.passed) lines.push("No errors found.");
  return lines.join("\n");
}
