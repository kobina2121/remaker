import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useDocument, useUpdateDocument, useAddNumber } from "@/hooks/use-remaker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  Download, 
  Share2, 
  ArrowLeft, 
  AlertCircle, 
  CheckCircle2, 
  Hash, 
  Loader2,
  Copy
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

export default function DocumentView() {
  const [match, params] = useRoute("/doc/:id");
  const id = params?.id;
  
  if (!match || !id) return <div className="p-8">Invalid URL</div>;

  const { data: document, isLoading, error } = useDocument(id);
  const updateDoc = useUpdateDocument();
  const addNumber = useAddNumber();
  const { toast } = useToast();

  const [inputValue, setInputValue] = useState("");
  const [isErrorShake, setIsErrorShake] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on load
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <h2 className="text-2xl font-bold text-destructive">Document not found</h2>
        <Link href="/">
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Go Home</Button>
        </Link>
      </div>
    );
  }

  const handleRename = (e: React.FocusEvent<HTMLInputElement>) => {
    const newName = e.target.value.trim();
    if (newName && newName !== document.name) {
      updateDoc.mutate({ id, name: newName });
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied!",
        description: "Share this link with others to collaborate.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to copy",
        description: "Please copy the URL manually.",
      });
    }
  };

  const handleDownload = () => {
    if (!document.numbers || document.numbers.length === 0) {
      toast({
        variant: "destructive",
        description: "List is empty. Nothing to download.",
      });
      return;
    }

    const content = document.numbers.map(n => n.value).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.name.replace(/\s+/g, "_")}_list.txt`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Little celebration
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = inputValue.trim();
    if (!value) return;

    // Client-side duplicate check for immediate feedback (optional but nice)
    // The server is the source of truth, but this saves a request
    const isDuplicate = document.numbers?.some(n => n.value === value);
    if (isDuplicate) {
      handleDuplicateError();
      return;
    }

    addNumber.mutate(
      { docId: id, value },
      {
        onSuccess: () => {
          setInputValue("");
          setErrorMessage(null);
          // Keep focus
          inputRef.current?.focus();
        },
        onError: (err) => {
          if (err.message === 'Duplicate ID detected') {
            handleDuplicateError();
          } else {
            setErrorMessage("Failed to save. Try again.");
          }
        }
      }
    );
  };

  const handleDuplicateError = () => {
    setIsErrorShake(true);
    setErrorMessage("Duplicate ID detected!");
    setTimeout(() => setIsErrorShake(false), 500);
    // Select the text so user can easily type over it
    inputRef.current?.select();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-5xl mx-auto p-4 md:p-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-12 animate-in">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <input
              type="text"
              defaultValue={document.name}
              onBlur={handleRename}
              className="bg-transparent text-2xl md:text-3xl font-bold font-display text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg px-2 -ml-2 w-full transition-all hover:bg-muted/50"
            />
            <div className="text-sm text-muted-foreground px-2 flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full", updateDoc.isPending ? "bg-yellow-400" : "bg-green-500")}></span>
              {updateDoc.isPending ? "Saving..." : "Saved"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button 
            variant="outline" 
            onClick={() => {
              toast({
                title: "Changes saved",
                description: "All IDs are automatically saved as you type.",
                duration: 2000,
              });
            }} 
            className="flex-1 md:flex-none border-primary/20 hover:bg-primary/5"
          >
            <CheckCircle2 className="mr-2 h-4 w-4 text-primary" />
            Save List
          </Button>
          <Button variant="outline" onClick={handleShare} className="flex-1 md:flex-none">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          <Button variant="default" onClick={handleDownload} className="flex-1 md:flex-none shadow-lg shadow-primary/20">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Input Section - Sticky on Desktop */}
        <div className="lg:col-span-5 space-y-6">
          <div className="lg:sticky lg:top-8 p-6 md:p-8 rounded-2xl bg-card border border-border/60 shadow-xl shadow-black/5">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Hash className="w-5 h-5 text-primary" />
                Add Entry
              </h2>
              <p className="text-muted-foreground text-sm">
                Type a unique ID and press Enter. Duplicates will be rejected instantly.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="relative">
              <div className={cn("relative transition-transform duration-100", isErrorShake ? "translate-x-[-4px, 4px]" : "")}>
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter ID..."
                  className={cn(
                    "h-16 text-2xl font-mono tracking-wider px-4 transition-all duration-200",
                    errorMessage 
                      ? "border-destructive focus-visible:ring-destructive/20 bg-destructive/5" 
                      : "focus-visible:ring-primary/20 focus-visible:border-primary"
                  )}
                  autoComplete="off"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                   {addNumber.isPending ? (
                     <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                   ) : (
                     <Button 
                       type="submit" 
                       size="icon" 
                       variant="ghost" 
                       className="h-10 w-10 rounded-full hover:bg-primary/10 hover:text-primary"
                       disabled={!inputValue.trim()}
                     >
                       <CheckCircle2 className="w-6 h-6" />
                     </Button>
                   )}
                </div>
              </div>

              <div className="h-6 mt-2">
                <AnimatePresence>
                  {errorMessage && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 text-destructive text-sm font-medium"
                    >
                      <AlertCircle className="w-4 h-4" />
                      {errorMessage}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </form>

            <div className="mt-8 pt-8 border-t border-border">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Unique IDs</span>
                <span className="text-2xl font-bold font-mono text-foreground">{document.numbers?.length || 0}</span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full transition-all duration-500 ease-out" 
                  style={{ width: `${Math.min((document.numbers?.length || 0) * 2, 100)}%` }} // Just a visual filler
                />
              </div>
            </div>
          </div>
        </div>

        {/* List Section */}
        <div className="lg:col-span-7">
          <div className="bg-card rounded-2xl border border-border/60 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
            <div className="p-4 border-b border-border/40 bg-muted/30 flex items-center justify-between">
              <span className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Entries</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(document.numbers?.map(n => n.value).join('\n') || '');
                  toast({ title: "Copied all items" });
                }}
              >
                <Copy className="w-3 h-3 mr-1.5" />
                Copy All
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-[calc(100vh-200px)]">
              {document.numbers && document.numbers.length > 0 ? (
                <div className="grid grid-cols-1 divide-y divide-border/30">
                  {/* We reverse to show newest first */}
                  {[...document.numbers].reverse().map((num, idx) => (
                    <motion.div 
                      key={num.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx === 0 ? 0 : 0.05 }} // Animate only new/top items nicely
                      className="group flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                    >
                      <span className="font-mono text-lg text-foreground/90">{num.value}</span>
                      <span className="text-xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date(num.createdAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Hash className="w-8 h-8 opacity-20" />
                  </div>
                  <p>No entries yet.</p>
                  <p className="text-sm opacity-60">Start typing IDs on the left.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
