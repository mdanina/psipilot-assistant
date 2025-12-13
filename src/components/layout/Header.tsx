import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/contexts/SidebarContext";

interface HeaderProps {
  title: string;
  icon?: React.ReactNode;
}

export const Header = ({ title, icon }: HeaderProps) => {
  const { open } = useSidebar();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={open}
          aria-label="Открыть меню"
        >
          <Menu className="h-5 w-5" />
        </Button>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
    </header>
  );
};
