import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ShieldX, LogOut } from "lucide-react";

export default function UnauthorizedPage() {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-md">
        <ShieldX className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="font-heading text-2xl font-bold text-foreground">Ruxsat yo'q</h1>
        <p className="text-muted-foreground">
          Sizning hisobingizda boshqaruv paneliga kirish huquqi mavjud emas. 
          Agar bu xato deb hisoblasangiz, administratorga murojaat qiling.
        </p>
        <Button onClick={signOut} variant="outline" className="border-border text-foreground">
          <LogOut className="mr-2 h-4 w-4" /> Chiqish
        </Button>
      </div>
    </div>
  );
}
