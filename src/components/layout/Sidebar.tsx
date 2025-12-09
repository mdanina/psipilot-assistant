import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Building2, ChevronDown, User, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ShrimpIcon } from "@/components/ShrimpIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { name: "Запись аудио", icon: "/assets/bell_17821680.png", path: "/", isImage: true },
  { name: "Пациенты", icon: "/assets/fishes_17821722.png", path: "/patients", isImage: true },
  { name: "Сессии", icon: "/assets/lighthouse_17821735.png", path: "/sessions", isImage: true },
  { name: "Календарь", icon: "/assets/compass_17821700.png", path: "/calendar", isImage: true },
];

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, signOut } = useAuth();
  
  // Get user initials from profile or user email
  const getUserInitials = () => {
    if (profile?.full_name) {
      const names = profile.full_name.split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[1][0]).toUpperCase();
      }
      return names[0][0].toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };
  
  const userEmail = profile?.email || user?.email || '';
  const userInitials = getUserInitials();
  
  return (
    <aside className="w-[220px] h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 flex flex-col items-center gap-2">
        <ShrimpIcon className="w-10 h-10" />
        <h1 className="text-2xl font-bold text-foreground">supershrimp</h1>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          ИИ КОПАЙЛОТ
        </span>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={`sidebar-item ${isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}`}
                >
                  {item.isImage ? (
                    <img src={item.icon} alt={item.name} className="w-10 h-10" />
                  ) : (
                    <item.icon className="w-10 h-10" />
                  )}
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
          <img src="/assets/helm_17821727.png" alt="Админка" className="w-10 h-10" />
          <span>Админка</span>
        </NavLink>
        
        {/* User */}
        {userEmail && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="px-4 py-3 mt-2 border-t border-sidebar-border space-y-2 cursor-pointer hover:bg-accent/50 rounded-md transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                    {userInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    {profile?.full_name ? (
                      <p className="text-sm font-medium text-foreground truncate">{profile.full_name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
                    )}
                    {profile?.full_name && (
                      <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
                {profile?.clinic && (
                  <div className="flex items-center gap-2 pl-11">
                    <Building2 className="w-3 h-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground truncate">{profile.clinic.name}</p>
                  </div>
                )}
                {profile?.clinic_id && !profile?.clinic && (
                  <div className="flex items-center gap-2 pl-11">
                    <Building2 className="w-3 h-3 text-muted-foreground animate-pulse" />
                    <p className="text-xs text-muted-foreground">Загрузка клиники...</p>
                  </div>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <User className="w-4 h-4 mr-2" />
                <span>Редактировать профиль</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate("/login");
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span>Выйти</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  );
};
