import { useState } from "react";
import { Outlet } from "react-router-dom";
import { CMSidebar } from "./CMSidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Tv } from "lucide-react";

export function CMLayout() {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <CMSidebar />
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <div className="lg:pl-60">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
            <div className="flex items-center gap-2">
              <Tv className="h-6 w-6 text-primary" />
              <div>
                <p className="font-heading text-base font-semibold text-foreground">VoiPlay CM</p>
                <p className="text-xs text-muted-foreground">Mobil boshqaruv</p>
              </div>
            </div>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="border-border bg-card">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
          </header>

          <main className="min-h-[calc(100vh-4rem)] overflow-y-auto lg:min-h-screen">
            <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          </main>
        </div>

        <SheetContent side="left" className="w-[88vw] max-w-xs border-border bg-sidebar p-0">
          <CMSidebar mobile onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
