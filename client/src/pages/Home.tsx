import { useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateDocument } from "@/hooks/use-remaker";
import { CategoryPicker } from "@/components/CategoryPicker";
import { categoryLabel } from "@shared/categories";

export default function Home() {
  const [, setLocation] = useLocation();
  const createDoc = useCreateDocument();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  // A list still cannot be created without first choosing a remake type.
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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <div className="z-10 max-w-3xl w-full text-center space-y-12">
        <div className="space-y-6 animate-in" style={{ animationDelay: "0ms" }}>
          <img
            src="/icps-logo.png"
            alt="ICPS - Intelligent Card Production Systems"
            className="h-16 md:h-20 w-auto mx-auto mb-4"
          />
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground">
            Remaker
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            The fastest way to verify unique IDs. <br />
            Simple, secure, and instant duplication detection.
          </p>
        </div>

        <div
          className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-in"
          style={{ animationDelay: "150ms" }}
        >
          <Button
            size="lg"
            onClick={() => setPickerOpen(true)}
            disabled={createDoc.isPending}
            className="text-lg px-8 py-6 shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all hover:-translate-y-1"
          >
            {createDoc.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
            Start a New List
          </Button>

          <Button
            size="lg"
            variant="outline"
            onClick={() => setLocation("/lists")}
            className="text-lg px-8 py-6 transition-all hover:-translate-y-1"
          >
            View All Lists
          </Button>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 animate-in"
          style={{ animationDelay: "300ms" }}
        >
          <FeatureCard
            title="Instant Verification"
            description="Typing a duplicate number triggers an immediate alert. No waiting."
          />
          <FeatureCard
            title="Uniqueness Guaranteed"
            description="Our system ensures 100% unique values within your document."
          />
          <FeatureCard
            title="Easy Export"
            description="Download your verified list as a simple text file instantly."
          />
        </div>
      </div>

      <CategoryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleSelectCategory}
        pendingId={pendingCategory}
      />
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-card/50 border border-border/50 backdrop-blur-sm shadow-sm hover:bg-card/80 transition-colors text-left">
      <h3 className="text-lg font-semibold mb-2 font-display">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}
