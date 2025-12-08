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
    </header>
  );
};
