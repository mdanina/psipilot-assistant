import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft, Mail, KeyRound } from 'lucide-react';
import { ShrimpIcon } from '@/components/ShrimpIcon';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate email
    if (!email.trim()) {
      setError('Пожалуйста, введите email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Пожалуйста, введите корректный email');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await resetPassword(email);

      if (error) {
        // Handle specific error messages
        if (error.message.includes('User not found') || error.message.includes('not found')) {
          // Don't reveal if user exists for security
          setIsSuccess(true);
        } else if (error.message.includes('Too many requests')) {
          setError('Слишком много запросов. Подождите несколько минут');
        } else {
          setError(error.message);
        }
        return;
      }

      setIsSuccess(true);
    } catch (err) {
      setError('Произошла непредвиденная ошибка. Пожалуйста, попробуйте снова.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">Проверьте почту</CardTitle>
              <CardDescription className="text-base">
                Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              <div className="rounded-lg bg-muted/50 p-4 text-center">
                <p className="font-medium text-foreground mb-1">{email}</p>
                <p className="text-sm text-muted-foreground">
                  Ссылка действительна в течение 24 часов
                </p>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Если письмо не пришло:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Проверьте папку "Спам"</li>
                  <li>Убедитесь, что email введён правильно</li>
                  <li>Попробуйте отправить ссылку повторно</li>
                </ul>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-3 pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setIsSuccess(false);
                  setEmail('');
                }}
              >
                <Mail className="mr-2 h-4 w-4" />
                Отправить повторно
              </Button>

              <Link to="/login" className="w-full">
                <Button variant="ghost" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Вернуться к входу
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        {/* Back to login link */}
        <div className="mb-6">
          <Link
            to="/login"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к входу
          </Link>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-4 ring-primary/5">
                <KeyRound className="h-7 w-7 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Восстановление пароля</CardTitle>
            <CardDescription>
              Введите email, и мы отправим ссылку для сброса пароля
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-4">
              {error && (
                <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="doctor@clinic.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={isSubmitting}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Введите email, указанный при регистрации
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4 pt-2">
              <Button
                type="submit"
                className="w-full h-11 text-base font-medium"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Отправка...
                  </>
                ) : (
                  'Отправить ссылку'
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Вспомнили пароль?{' '}
                <Link to="/login" className="text-primary font-medium hover:underline">
                  Войти
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>

        {/* Security note */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Мы никогда не отправляем пароли по email
        </p>
      </div>
    </div>
  );
}
