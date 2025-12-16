import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Save, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DecryptedPatient } from "@/lib/supabase-patients";
import type { Database } from "@/types/database.types";

type PatientInsert = Database['public']['Tables']['patients']['Insert'];
type PatientUpdate = Database['public']['Tables']['patients']['Update'];

interface PatientFormProps {
  patient?: DecryptedPatient | null;
  onSave: (data: PatientInsert | PatientUpdate) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

interface PatientFormData {
  name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  address: string;
  notes: string;
  tags: string[];
}

export function PatientForm({ patient, onSave, onCancel, isSaving = false }: PatientFormProps) {
  const [tagsInput, setTagsInput] = useState(patient?.tags?.join(', ') || '');

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<PatientFormData>({
    defaultValues: {
      name: patient?.name || '',
      email: patient?.email || '',
      phone: patient?.phone || '',
      date_of_birth: patient?.date_of_birth ? new Date(patient.date_of_birth).toISOString().split('T')[0] : '',
      gender: patient?.gender || '',
      address: patient?.address || '',
      notes: patient?.notes || '',
      tags: patient?.tags || [],
    },
  });

  const gender = watch('gender');

  const onSubmit = async (data: PatientFormData) => {
    // Parse tags from comma-separated string
    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    // Validate name - must not be empty after trim
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      // This should be caught by form validation, but double-check
      return;
    }

    const formData: PatientInsert | PatientUpdate = {
      name: trimmedName,
      email: data.email.trim() || null,
      phone: data.phone.trim() || null,
      date_of_birth: data.date_of_birth || null,
      gender: data.gender || null,
      address: data.address.trim() || null,
      notes: data.notes.trim() || null,
      tags: tags.length > 0 ? tags : [],
    };

    await onSave(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{patient ? 'Редактировать пациента' : 'Новый пациент'}</CardTitle>
        <CardDescription>
          {patient ? 'Измените данные пациента' : 'Заполните информацию о пациенте'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Name - Required */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Имя <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              {...register('name', { 
                required: 'Имя обязательно',
                validate: (value) => {
                  if (!value || value.trim().length === 0) {
                    return 'Имя не может быть пустым';
                  }
                  return true;
                }
              })}
              placeholder="Иван Иванов"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Email and Phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="ivan@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                type="tel"
                {...register('phone')}
                placeholder="+7 (999) 123-45-67"
              />
            </div>
          </div>

          {/* Date of Birth and Gender */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Дата рождения</Label>
              <Input
                id="date_of_birth"
                type="date"
                {...register('date_of_birth')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Пол</Label>
              <Select value={gender} onValueChange={(value) => setValue('gender', value)}>
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Выберите пол" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="мужской">Мужской</SelectItem>
                  <SelectItem value="женский">Женский</SelectItem>
                  <SelectItem value="другой">Другой</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address">Адрес</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder="Город, улица, дом"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Заметки</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Дополнительная информация о пациенте"
              rows={4}
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="tags">Теги (через запятую)</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="тег1, тег2, тег3"
            />
            <p className="text-xs text-muted-foreground">
              Введите теги через запятую для удобной организации
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSaving}
            >
              <X className="w-4 h-4 mr-2" />
              Отмена
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Сохранение...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Сохранить
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}





