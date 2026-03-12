import { useState } from "react";
import { useAuth, getDashboardPath } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tv } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { user, roles, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  
  // If user is logged in, redirect based on their role
  if (user && roles.length > 0) {
    return <Navigate to={getDashboardPath(roles)} replace />;
  }
  // If user exists but no roles loaded yet, wait
  if (user && roles.length === 0) {
    return <div className="flex h-screen items-center justify-center bg-background"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error("Kirish xatosi: " + error.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Tv className="h-10 w-10 text-primary" />
            <span className="font-heading text-2xl font-bold text-foreground">VoiPlay</span>
            <span className="text-sm font-medium text-muted-foreground">TV</span>
          </div>
          <p className="text-sm text-muted-foreground">Boshqaruv paneliga kirish</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-heading font-medium text-muted-foreground">Elektron pochta</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="bg-background border-border text-foreground" placeholder="admin@voiplay.tv" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-heading font-medium text-muted-foreground">Parol</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="bg-background border-border text-foreground" placeholder="••••••••" />
          </div>
          <Button type="submit" disabled={submitting} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            {submitting ? "Kirish..." : "Kirish"}
          </Button>
        </form>
      </div>
    </div>
  );
}
