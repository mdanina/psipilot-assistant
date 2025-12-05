import { Search, Command } from "lucide-react";
import { Input } from "@/components/ui/input";

interface HeaderProps {
  title: string;
  icon?: React.ReactNode;
}

export const Header = ({ title, icon }: HeaderProps) => {
  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          className="pl-9 pr-12 h-9 bg-background"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-muted-foreground">
          <Command className="w-3 h-3" />
          <span>K</span>
        </div>
      </div>
    </header>
  );
};
