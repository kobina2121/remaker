import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REMAKE_CATEGORIES } from "@shared/categories";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Step between "New List" and the editor: a remake list cannot exist without a
 * category, so one is chosen here first. Options come from REMAKE_CATEGORIES,
 * so a new category needs no change in this file.
 */
export function CategoryPicker({
  open,
  onOpenChange,
  onSelect,
  pendingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (categoryId: string) => void;
  /** Category currently being created, so its row can show a spinner. */
  pendingId?: string | null;
}) {
  const busy = !!pendingId;

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Select Remake Type</DialogTitle>
          <DialogDescription>
            Every remake list belongs to one category. Records added to the list are associated
            with the category you pick here.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 mt-1 max-h-[55vh] overflow-y-auto px-1">
          <div className="grid gap-2">
            {REMAKE_CATEGORIES.map((category) => {
              const pending = pendingId === category.id;

              return (
                <button
                  key={category.id}
                  onClick={() => onSelect(category.id)}
                  disabled={busy}
                  className={cn(
                    "group flex items-center gap-3 w-full text-left p-4 rounded-xl border transition-all",
                    "border-border/60 bg-card hover:border-primary hover:bg-primary/[0.03]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    busy && !pending && "opacity-50",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium group-hover:text-primary transition-colors">
                      {category.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{category.description}</p>
                  </div>

                  {pending ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
