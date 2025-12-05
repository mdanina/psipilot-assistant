import { NavLink, useLocation } from "react-router-dom";
import { FileText, Users, Calendar, Building2, Settings, ChevronDown } from "lucide-react";

const navItems = [
  { name: "Scribe", icon: FileText, path: "/" },
  { name: "Patients", icon: Users, path: "/patients" },
  { name: "Sessions", icon: Calendar, path: "/sessions" },
  { name: "Clinic", icon: Building2, path: "/clinic" },
];

export const Sidebar = () => {
  const location = useLocation();
  
  return (
    <aside className="w-[220px] h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5">
        <h1 className="text-2xl font-bold text-foreground">aisel</h1>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 px-3">
        <div className="mb-4">
          <span className="px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Platform
          </span>
        </div>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={`sidebar-item ${isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      
      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-1">
        <NavLink
          to="/administration"
          className="sidebar-item sidebar-item-inactive"
        >
          <Settings className="w-5 h-5" />
          <span>Administration</span>
        </NavLink>
        
        {/* User */}
        <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-sidebar-border">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
            CH
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground truncate">christian@aisel.co</p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </aside>
  );
};
