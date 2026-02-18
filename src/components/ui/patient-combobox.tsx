import * as React from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Database } from "@/types/database.types";

type Patient = Database['public']['Tables']['patients']['Row'];

interface PatientComboboxProps {
  patients: Patient[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function PatientCombobox({
  patients,
  value,
  onValueChange,
  placeholder = "Выберите пациента",
  disabled = false,
}: PatientComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedPatient = patients.find((patient) => patient.id === value);

  const getPatientSearchValue = (patient: Patient) =>
    [patient.name, patient.email ?? '', patient.phone ?? '', patient.id].join(' ');

  const getPatientSubtitle = (patient: Patient) =>
    patient.email || patient.phone || `ID: ${patient.id.slice(0, 8)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedPatient ? (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <div className="flex min-w-0 flex-col items-start">
                <span className="truncate">{selectedPatient.name}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {getPatientSubtitle(selectedPatient)}
                </span>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Поиск пациента..." />
          <CommandList>
            <CommandEmpty>Пациенты не найдены</CommandEmpty>
            <CommandGroup>
              {patients.map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={getPatientSearchValue(patient)}
                  onSelect={() => {
                    onValueChange(patient.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === patient.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{patient.name}</span>
                      <span className="text-xs text-muted-foreground">{getPatientSubtitle(patient)}</span>
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}






