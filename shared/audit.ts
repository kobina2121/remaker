// Audit number -> Record ID / Box ID derivation.
//
// These rules were reverse-engineered from the project's own data files and
// verified against 225,000 records in whitelist-analyzer-AA-1m-audit-test,
// both Remake_1-*.txt exports, and the COMBINE missing-audit report:
//
//   records 1..500 fill one box, then the box counter advances
//   the box counter wraps back to 0 after 2000 boxes (every 1,000,000 audits)
//
// e.g. audit 12345678 -> record 0178, box 000692
//      audit 99990999 -> record 0499, box 001982

export const RECORDS_PER_BOX = 500;
export const BOX_CYCLE = 2000;

export const AUDIT_DIGITS = 8;
/** Optional leading letters, e.g. the "AA" in AA00025000. */
export const AUDIT_PREFIX_LENGTH = 2;
export const RECORD_ID_DIGITS = 4;
export const BOX_ID_DIGITS = 6;

export const DEFAULT_WHITELIST = "AM399G_600105483_20170811.xml";

/** Largest range a single Apply may generate, to keep the editor responsive. */
export const MAX_RANGE_SIZE = 50000;

export type AuditRow = {
  auditNo: string;
  recordId: string;
  boxId: string;
  whitelist: string;
};

const AUDIT_PATTERN = new RegExp(`^([A-Za-z]{${AUDIT_PREFIX_LENGTH}})?\\d{${AUDIT_DIGITS}}$`);
const PREFIX_PATTERN = new RegExp(`^([A-Za-z]{${AUDIT_PREFIX_LENGTH}})?$`);

/** True for 8 digits, optionally led by a two-letter prefix (AA00025000). */
export function isValidAuditNo(value: string): boolean {
  return AUDIT_PATTERN.test(value.trim());
}

/** True for an empty prefix or exactly two letters. */
export function isValidPrefix(value: string): boolean {
  return PREFIX_PATTERN.test(value.trim());
}

/** Splits an audit number into its letter prefix and its digits. */
export function splitAuditNo(value: string): { prefix: string; digits: string } {
  const cleaned = value.trim();
  const letters = cleaned.match(/^[A-Za-z]*/)?.[0] ?? "";
  return {
    prefix: letters.toUpperCase().slice(0, AUDIT_PREFIX_LENGTH),
    digits: cleaned.slice(letters.length).replace(/\D/g, ""),
  };
}

/**
 * Keeps up to two leading letters and up to eight digits, dropping anything
 * else, so the field cannot hold a value the validator would reject.
 */
export function sanitizeAuditInput(value: string): string {
  const { prefix, digits } = splitAuditNo(value.replace(/[^A-Za-z0-9]/g, ""));
  return prefix + digits.slice(0, AUDIT_DIGITS);
}

/** Normalises a typed prefix to uppercase letters only. */
export function sanitizePrefixInput(value: string): string {
  return value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, AUDIT_PREFIX_LENGTH);
}

/**
 * Numeric value of an audit number, or null when it is not valid.
 * The letter prefix is ignored: AA00008115 and 00008115 both derive from 8115.
 */
export function parseAuditNo(value: string): number | null {
  const trimmed = value.trim();
  if (!isValidAuditNo(trimmed)) return null;
  return Number(splitAuditNo(trimmed).digits);
}

/** Replaces (or removes) the letter prefix on an existing audit number. */
export function applyPrefix(auditNo: string, prefix: string): string {
  return sanitizePrefixInput(prefix) + splitAuditNo(auditNo).digits;
}

/** Pads a number to `digits`, keeping only the low-order digits if it overflows. */
function pad(value: number, digits: number): string {
  return String(value).padStart(digits, "0").slice(-digits);
}

export function deriveRecordId(audit: number): string {
  return pad(((audit - 1) % RECORDS_PER_BOX) + 1, RECORD_ID_DIGITS);
}

export function deriveBoxId(audit: number): string {
  return pad((Math.floor((audit - 1) / RECORDS_PER_BOX) + 1) % BOX_CYCLE, BOX_ID_DIGITS);
}

/** Formats a numeric audit value back to its 8-digit form, with optional prefix. */
export function formatAuditNo(audit: number, prefix = ""): string {
  return sanitizePrefixInput(prefix) + pad(audit, AUDIT_DIGITS);
}

/**
 * Builds a full row from an audit number. Returns null when the audit number
 * is not exactly 8 digits.
 */
export function deriveRow(auditNo: string, whitelist = DEFAULT_WHITELIST): AuditRow | null {
  const audit = parseAuditNo(auditNo);
  if (audit === null) return null;

  const { prefix, digits } = splitAuditNo(auditNo);

  return {
    // Stored uppercase and zero-padded so AA00025000 and aa25000 agree.
    auditNo: prefix + digits,
    recordId: deriveRecordId(audit),
    boxId: deriveBoxId(audit),
    whitelist,
  };
}

/**
 * Two different audit numbers share a Record ID + Box ID once they are
 * 1,000,000 apart (500 x 2000), so this pair is what uniqueness is checked on.
 */
export function rowKey(row: Pick<AuditRow, "recordId" | "boxId">): string {
  return `${row.recordId}-${row.boxId}`;
}
