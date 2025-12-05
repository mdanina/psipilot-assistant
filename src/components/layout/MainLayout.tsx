import { Sidebar } from "./Sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
};
