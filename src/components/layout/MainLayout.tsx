import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./Sidebar";
import { MobileSidebar } from "./MobileSidebar";
import { useSidebar } from "@/contexts/SidebarContext";

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const { open } = useSidebar();

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      {/* Mobile sidebar - shown only on mobile */}
      <MobileSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header with menu button - only visible on mobile */}
        <div className="md:hidden h-14 border-b border-border bg-card flex items-center px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={open}
            aria-label="Открыть меню"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        {children}
      </main>
    </div>
  );
};
