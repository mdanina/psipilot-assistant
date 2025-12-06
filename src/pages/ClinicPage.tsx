import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2, CheckCircle2, AlertCircle, Edit } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const ClinicPage = () => {
  const { profile, refreshProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicEmail, setClinicEmail] = useState('');

  // Update form state when clinic loads
  useEffect(() => {
    if (profile?.clinic) {
      setClinicName(profile.clinic.name || '');
      setClinicAddress(profile.clinic.address || '');
      setClinicPhone(profile.clinic.phone || '');
      setClinicEmail(profile.clinic.email || '');
    }
  }, [profile?.clinic]);

  const handleSave = async () => {
    if (!profile?.clinic_id) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase
        .from('clinics')
        .update({
          name: clinicName.trim(),
          address: clinicAddress.trim() || null,
          phone: clinicPhone.trim() || null,
          email: clinicEmail.trim() || null,
        })
        .eq('id', profile.clinic_id);

      if (updateError) {
        setError(`Не удалось обновить клинику: ${updateError.message}`);
        return;
      }

      setSuccess('Клиника успешно обновлена');
      setIsEditing(false);
      await refreshProfile();
    } catch (err) {
      setError(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (profile?.clinic) {
      setClinicName(profile.clinic.name || '');
      setClinicAddress(profile.clinic.address || '');
      setClinicPhone(profile.clinic.phone || '');
      setClinicEmail(profile.clinic.email || '');
    }
  };

  return (
    <>
      <Header title="Клиника" icon={<Building2 className="w-5 h-5" />} />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-6">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <CardTitle>Информация о клинике</CardTitle>
                </div>
                {profile?.clinic && !isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Редактировать
                  </Button>
                )}
              </div>
              <CardDescription>
                Управление данными и настройками вашей клиники
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!profile?.clinic_id ? (
                <div className="text-center py-12">
                  <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">Клиника не назначена</h2>
                  <p className="text-muted-foreground mb-6">
                    У вас нет клиники, назначенной на ваш аккаунт. Пожалуйста, свяжитесь с администратором.
                  </p>
                  <Button asChild>
                    <a href="/onboarding">Завершить настройку</a>
                  </Button>
                </div>
              ) : !profile?.clinic ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 text-muted-foreground mx-auto mb-4 animate-spin" />
                  <p className="text-muted-foreground">Загрузка информации о клинике...</p>
                </div>
              ) : isEditing ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="clinicName">Название клиники *</Label>
                    <Input
                      id="clinicName"
                      value={clinicName}
                      onChange={(e) => setClinicName(e.target.value)}
                      placeholder="Введите название клиники"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinicAddress">Адрес</Label>
                    <Input
                      id="clinicAddress"
                      value={clinicAddress}
                      onChange={(e) => setClinicAddress(e.target.value)}
                      placeholder="Введите адрес клиники"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinicPhone">Телефон</Label>
                    <Input
                      id="clinicPhone"
                      value={clinicPhone}
                      onChange={(e) => setClinicPhone(e.target.value)}
                      placeholder="Введите телефон клиники"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinicEmail">Email</Label>
                    <Input
                      id="clinicEmail"
                      type="email"
                      value={clinicEmail}
                      onChange={(e) => setClinicEmail(e.target.value)}
                      placeholder="Введите email клиники"
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || !clinicName.trim()}
                    >
                      {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Сохранить изменения
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      Отмена
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-muted-foreground">Название клиники</Label>
                    <p className="text-sm font-medium mt-1">{profile.clinic.name || 'Не задано'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Адрес</Label>
                    <p className="text-sm font-medium mt-1">{profile.clinic.address || 'Не задано'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Телефон</Label>
                    <p className="text-sm font-medium mt-1">{profile.clinic.phone || 'Не задано'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="text-sm font-medium mt-1">{profile.clinic.email || 'Не задано'}</p>
                  </div>
                  <div className="pt-4 border-t">
                    <Label className="text-muted-foreground">ID клиники</Label>
                    <p className="text-sm font-mono text-muted-foreground mt-1">{profile.clinic_id}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default ClinicPage;
