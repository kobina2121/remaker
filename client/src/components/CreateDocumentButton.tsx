import { useCreateDocument } from "@/hooks/use-remaker";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";

interface CreateDocumentButtonProps {
  className?: string;
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  children?: React.ReactNode;
}

export function CreateDocumentButton({ className, variant = "default", size = "lg", children }: CreateDocumentButtonProps) {
  const [, setLocation] = useLocation();
  const { mutate, isPending } = useCreateDocument();

  const handleCreate = () => {
    mutate(
      { name: "Untitled List" },
      {
        onSuccess: (doc) => {
          setLocation(`/doc/${doc.id}`);
        },
      }
    );
  };

  return (
    <Button 
      onClick={handleCreate} 
      disabled={isPending} 
      className={className} 
      variant={variant}
      size={size}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Creating...
        </>
      ) : (
        children || (
          <>
            <Plus className="mr-2 h-5 w-5" />
            Start New List
          </>
        )
      )}
    </Button>
  );
}
