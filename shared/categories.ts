/**
 * Remake categories.
 *
 * This array is the single source of truth: adding a category here makes it
 * appear in the picker, the dashboard filter and the editor automatically.
 * Ids are stored on documents, so treat them as permanent once in use - change
 * a `label` freely, but never an `id` that already has lists against it.
 */
export type RemakeCategory = {
  id: string;
  label: string;
  /** Shown under the label in the category picker. */
  description: string;
};

export const REMAKE_CATEGORIES: readonly RemakeCategory[] = [
  {
    id: "chip-defect",
    label: "Chip Defect",
    description: "Cards rejected for a faulty or unreadable chip",
  },
  {
    id: "card-defect",
    label: "Card Defect",
    description: "Physical damage or printing faults on the card body",
  },
  {
    id: "repressing-chip",
    label: "Repressing Chip",
    description: "Chips being re-pressed and re-issued",
  },
  {
    id: "invisible-laser-id",
    label: "Invisible Laser ID",
    description: "Cards remade for invisible laser identification",
  },
  {
    id: "other",
    label: "Other",
    description: "Anything that does not fit the categories above",
  },
];

/** Fallback for lists created before categories existed. */
export const DEFAULT_CATEGORY = "other";

export const CATEGORY_IDS: readonly string[] = REMAKE_CATEGORIES.map((c) => c.id);

export function isValidCategory(id: string): boolean {
  return CATEGORY_IDS.includes(id);
}

export function findCategory(id: string): RemakeCategory | undefined {
  return REMAKE_CATEGORIES.find((c) => c.id === id);
}

/** Display name for a category id, falling back to the raw id if unknown. */
export function categoryLabel(id: string): string {
  return findCategory(id)?.label ?? id;
}

/** "Chip Defect Remake List" - the editor heading for a category. */
export function categoryListTitle(id: string): string {
  return `${categoryLabel(id)} Remake List`;
}
