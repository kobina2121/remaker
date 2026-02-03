import { CreateDocumentButton } from "@/components/CreateDocumentButton";
import { FileSpreadsheet, ShieldCheck, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      <div className="z-10 max-w-3xl w-full text-center space-y-12">
        <div className="space-y-6 animate-in" style={{ animationDelay: '0ms' }}>
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 mb-4">
            <FileSpreadsheet className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground">
            Remaker
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            The fastest way to verify unique IDs. <br/>
            Simple, secure, and instant duplication detection.
          </p>
        </div>

        <div className="animate-in" style={{ animationDelay: '150ms' }}>
          <CreateDocumentButton className="text-lg px-8 py-6 shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all hover:-translate-y-1">
            Start a New List
          </CreateDocumentButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 animate-in" style={{ animationDelay: '300ms' }}>
          <FeatureCard 
            icon={<Zap className="w-6 h-6 text-yellow-500" />}
            title="Instant Verification"
            description="Typing a duplicate number triggers an immediate alert. No waiting."
          />
          <FeatureCard 
            icon={<ShieldCheck className="w-6 h-6 text-green-500" />}
            title="Uniqueness Guaranteed"
            description="Our system ensures 100% unique values within your document."
          />
          <FeatureCard 
            icon={<FileSpreadsheet className="w-6 h-6 text-blue-500" />}
            title="Easy Export"
            description="Download your verified list as a simple text file instantly."
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-6 rounded-2xl bg-card/50 border border-border/50 backdrop-blur-sm shadow-sm hover:bg-card/80 transition-colors text-left">
      <div className="mb-4 p-2 bg-background rounded-lg w-fit shadow-sm border border-border/30">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2 font-display">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}
