import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";

type Profile = Database['public']['Tables']['profiles']['Row'];

interface DoctorInfoProps {
  doctor: Profile | null;
  isAdmin?: boolean;
  onClick?: () => void;
  className?: string;
}

export function DoctorInfo({ doctor, isAdmin = false, onClick, className }: DoctorInfoProps) {
  if (!doctor) {
    return null;
  }

  const displayName = doctor.full_name || doctor.email || "Неизвестный врач";
  const specialization = doctor.specialization;

  if (isAdmin && onClick) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        className={cn("h-auto p-0 text-xs text-muted-foreground hover:text-foreground", className)}
      >
        <User className="w-3 h-3 mr-1" />
        <span className="font-medium">{displayName}</span>
        {specialization && (
          <span className="ml-1 text-muted-foreground">- {specialization}</span>
        )}
      </Button>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <User className="w-3 h-3" />
      <span className="font-medium">{displayName}</span>
      {specialization && (
        <span className="ml-1">- {specialization}</span>
      )}
    </div>
  );
}

