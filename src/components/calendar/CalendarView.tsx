import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay, isToday, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database.types";

type Session = Database['public']['Tables']['sessions']['Row'];

type ViewMode = 'day' | 'week' | 'month';

interface CalendarViewProps {
  viewMode: ViewMode;
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  appointments: Session[];
}

export function CalendarView({
  viewMode,
  selectedDate,
  onDateSelect,
  appointments,
}: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(selectedDate);

  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter((appointment) => {
      if (!appointment.scheduled_at) return false;
      return isSameDay(new Date(appointment.scheduled_at), date);
    });
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    if (viewMode === 'day') {
      onDateSelect(direction === 'next' ? addDays(selectedDate, 1) : subDays(selectedDate, 1));
    } else if (viewMode === 'week') {
      onDateSelect(direction === 'next' ? addWeeks(selectedDate, 1) : subWeeks(selectedDate, 1));
    } else {
      setCurrentMonth(direction === 'next' ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1));
    }
  };

  if (viewMode === 'day') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-medium">
              {format(selectedDate, "EEEE, d MMMM yyyy", { locale: ru })}
            </p>
            <p className="text-lg font-semibold">
              {format(selectedDate, "d MMMM yyyy", { locale: ru })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (viewMode === 'week') {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1, locale: ru });
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1, locale: ru });
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-medium">
              {format(weekStart, "d MMM", { locale: ru })} - {format(weekEnd, "d MMM yyyy", { locale: ru })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const dayAppointments = getAppointmentsForDate(day);
            const isSelected = isSameDay(day, selectedDate);

            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={cn(
                  "p-2 rounded-md border text-center transition-colors",
                  isSelected && "bg-primary text-primary-foreground",
                  isToday(day) && !isSelected && "bg-accent",
                  "hover:bg-accent"
                )}
              >
                <div className="text-xs font-medium">
                  {format(day, "EEE", { locale: ru })}
                </div>
                <div className="text-lg font-semibold">
                  {format(day, "d")}
                </div>
                {dayAppointments.length > 0 && (
                  <div className="mt-1 flex justify-center gap-1">
                    {dayAppointments.slice(0, 3).map((appointment, idx) => (
                      <div
                        key={appointment.id}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          appointment.meeting_format === 'online' && "bg-blue-500",
                          appointment.meeting_format === 'in_person' && "bg-purple-500",
                          !appointment.meeting_format && "bg-muted-foreground"
                        )}
                      />
                    ))}
                    {dayAppointments.length > 3 && (
                      <span className="text-xs">+{dayAppointments.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Month view
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-medium">
            {format(currentMonth, "LLLL yyyy", { locale: ru })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      <CalendarComponent
        mode="single"
        selected={selectedDate}
        onSelect={(date) => date && onDateSelect(date)}
        month={currentMonth}
        onMonthChange={setCurrentMonth}
        className="rounded-md border"
        modifiers={{
          hasAppointments: (date) => getAppointmentsForDate(date).length > 0,
        }}
        modifiersClassNames={{
          hasAppointments: "bg-blue-100 dark:bg-blue-900",
        }}
      />
    </div>
  );
}

