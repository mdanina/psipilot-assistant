import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Building2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function OnboardingPage() {
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!user) {
        setError('Пользователь не аутентифицирован');
        return;
      }

      // Use the SECURITY DEFINER function to create clinic and update profile atomically
      // This bypasses RLS issues and ensures data consistency
      const { data: clinicId, error: clinicError } = await supabase.rpc(
        'create_clinic_for_onboarding',
        {
          clinic_name: clinicName.trim(),
          clinic_address: clinicAddress.trim() || null,
          clinic_phone: clinicPhone.trim() || null,
          clinic_email: user.email || null,
        }
      );

      if (clinicError) {
        console.error('Error creating clinic:', clinicError);
        // Provide more helpful error messages
        let errorMessage = `Не удалось создать клинику: ${clinicError.message}`;
        if (clinicError.code === '42501' || clinicError.code === 'PGRST301') {
          errorMessage = 'Доступ запрещен. Пожалуйста, проверьте, что у вас есть необходимые разрешения для создания клиники.';
        } else if (clinicError.code === '23505') {
          errorMessage = 'Клиника с такими данными уже существует.';
        } else if (clinicError.message.includes('already has a clinic')) {
          errorMessage = 'У вас уже назначена клиника. Пожалуйста, обновите страницу.';
        } else if (clinicError.message.includes('timeout') || clinicError.message.includes('network')) {
          errorMessage = 'Ошибка сети. Пожалуйста, проверьте подключение и попробуйте снова.';
        }
        setError(errorMessage);
        setIsSubmitting(false);
        return;
      }

      if (!clinicId) {
        setError('Не удалось создать клинику. Пожалуйста, попробуйте снова.');
        setIsSubmitting(false);
        return;
      }

      // 3. Refresh profile to get updated data
      await refreshProfile();

      // 4. Redirect to home
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Onboarding error:', err);
      setError('Произошла непредвиденная ошибка. Пожалуйста, попробуйте снова.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Добро пожаловать в supershrimp!</CardTitle>
          <CardDescription>
            Давайте настроим вашу клинику для начала работы
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="clinicName">Название клиники *</Label>
              <Input
                id="clinicName"
                type="text"
                placeholder="Моя клиника"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicAddress">Адрес</Label>
              <Textarea
                id="clinicAddress"
                placeholder="ул. Примерная, д. 1, г. Москва"
                value={clinicAddress}
                onChange={(e) => setClinicAddress(e.target.value)}
                disabled={isSubmitting}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicPhone">Телефон</Label>
              <Input
                id="clinicPhone"
                type="tel"
                placeholder="+7 (999) 123-45-67"
                value={clinicPhone}
                onChange={(e) => setClinicPhone(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Вы будете администратором
              </div>
              <p className="text-sm text-muted-foreground">
                Как создатель клиники, вы получите полный доступ к управлению настройками,
                приглашению участников команды и настройке рабочего пространства.
              </p>
            </div>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !clinicName.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Создание клиники...
                </>
              ) : (
                'Создать клинику и продолжить'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
