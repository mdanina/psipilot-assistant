import { useState, useEffect } from "react";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// Common timezones for Russia and nearby regions
const COMMON_TIMEZONES = [
  { value: 'Europe/Moscow', label: 'Москва (MSK, UTC+3)' },
  { value: 'Europe/Kaliningrad', label: 'Калининград (EET, UTC+2)' },
  { value: 'Europe/Samara', label: 'Самара (SAMT, UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (YEKT, UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (OMST, UTC+6)' },
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск (KRAT, UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (IRKT, UTC+8)' },
  { value: 'Asia/Yakutsk', label: 'Якутск (YAKT, UTC+9)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (VLAT, UTC+10)' },
  { value: 'Asia/Magadan', label: 'Магадан (MAGT, UTC+11)' },
  { value: 'Asia/Kamchatka', label: 'Камчатка (PETT, UTC+12)' },
  { value: 'UTC', label: 'UTC (UTC+0)' },
];

// Get browser timezone
function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function TimezoneSelector() {
  const { profile, user } = useAuth();
  const [timezone, setTimezone] = useState<string>('UTC');
  const [isLoading, setIsLoading] = useState(true);

  // Load timezone from profile settings
  useEffect(() => {
    if (!profile || !user) return;

    const loadTimezone = async () => {
      try {
        // Get timezone from profile settings
        const settings = (profile.settings as { timezone?: string }) || {};
        let savedTimezone = settings.timezone;

        // If no timezone saved, try to detect from browser
        if (!savedTimezone) {
          savedTimezone = getBrowserTimezone();
          // Check if detected timezone is in our list, otherwise default to Moscow
          const isInList = COMMON_TIMEZONES.some(tz => tz.value === savedTimezone);
          if (!isInList) {
            savedTimezone = 'Europe/Moscow'; // Default for Russian users
          }
          // Save detected timezone to profile
          await saveTimezone(savedTimezone);
        }

        setTimezone(savedTimezone);
      } catch (error) {
        console.error('Error loading timezone:', error);
        setTimezone(getBrowserTimezone());
      } finally {
        setIsLoading(false);
      }
    };

    loadTimezone();
  }, [profile, user]);

  const saveTimezone = async (newTimezone: string) => {
    if (!user?.id) return;

    try {
      const currentSettings = (profile?.settings as Record<string, unknown>) || {};
      const updatedSettings = {
        ...currentSettings,
        timezone: newTimezone,
      };

      const { error } = await supabase
        .from('profiles')
        .update({ 
          settings: updatedSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error saving timezone:', error);
      } else {
        setTimezone(newTimezone);
      }
    } catch (error) {
      console.error('Error saving timezone:', error);
    }
  };

  const handleTimezoneChange = (newTimezone: string) => {
    saveTimezone(newTimezone);
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 text-muted-foreground" />
      <Select value={timezone} onValueChange={handleTimezoneChange}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Выберите временную зону" />
        </SelectTrigger>
        <SelectContent>
          {COMMON_TIMEZONES.map((tz) => (
            <SelectItem key={tz.value} value={tz.value}>
              {tz.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

