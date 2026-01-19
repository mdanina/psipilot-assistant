import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Lock, ShieldCheck, ArrowLeft, XCircle } from 'lucide-react';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/auth/PasswordStrengthIndicator';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Verify the recovery token on mount
  useEffect(() => {
    const verifyToken = async () => {
      // Check for token in query string (from Supabase email link)
      const token = searchParams.get('token');
      const type = searchParams.get('type');

      // Also check hash for standard Supabase format
      const hash = window.location.hash;

      if (token && type === 'recovery') {
        // Token from query string - verify it
        try {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'recovery',
          });

          if (error) {
            console.error('Token verification error:', error);
            setError('Недействительная или истёкшая ссылка для сброса пароля');
            setIsValidToken(false);
          } else {
            setIsValidToken(true);
          }
        } catch (err) {
          console.error('Token verification exception:', err);
          setError('Ошибка при проверке ссылки');
          setIsValidToken(false);
        }
      } else if (hash && hash.includes('type=recovery')) {
        // Token from hash fragment (standard Supabase format)
        // Supabase client handles this automatically
        setIsValidToken(true);
      } else {
        setError('Недействительная или истёкшая ссылка для сброса пароля');
        setIsValidToken(false);
      }

      setIsLoading(false);
    };

    verifyToken();
  }, [searchParams]);

  const validateForm = (): string | null => {
    if (!isPasswordStrong(password)) {
      return 'Пароль недостаточно надёжный. Выполните все требования';
    }
    if (password !== confirmPassword) {
      return 'Пароли не совпадают';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        if (error.message.includes('same as old')) {
          setError('Новый пароль должен отличаться от старого');
        } else {
          setError(error.message);
        }
        return;
      }

      setIsSuccess(true);

      // Sign out after password change and redirect to login
      await supabase.auth.signOut();

      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
    } catch (err) {
      setError('Произошла непредвиденная ошибка. Пожалуйста, попробуйте снова.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Проверка ссылки...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token state
  if (!isValidToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <div className="w-full max-w-md">
          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">Ссылка недействительна</CardTitle>
              <CardDescription className="text-base">
                {error || 'Ссылка для сброса пароля истекла или уже была использована'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
                <p>Возможные причины:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Ссылка была использована ранее</li>
                  <li>Прошло более 24 часов с момента запроса</li>
                  <li>Ссылка была скопирована неполностью</li>
                </ul>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-3 pt-2">
              <Link to="/forgot-password" className="w-full">
                <Button className="w-full">
                  Запросить новую ссылку
                </Button>
              </Link>

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

  // Success state
  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader className="space-y-1 text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Пароль изменён</CardTitle>
            <CardDescription className="text-base">
              Ваш пароль успешно обновлён
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Сейчас вы будете перенаправлены на страницу входа
              </p>
              <div className="flex justify-center mt-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button
              className="w-full"
              onClick={() => navigate('/login', { replace: true })}
            >
              Перейти к входу
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Main form
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
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Новый пароль</CardTitle>
            <CardDescription>
              Придумайте новый надёжный пароль для вашего аккаунта
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
                <Label htmlFor="password">Новый пароль</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Создайте надёжный пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <PasswordStrengthIndicator password={password} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Повторите пароль"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className="pl-10"
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Пароли не совпадают
                  </p>
                )}
                {confirmPassword && password === confirmPassword && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Пароли совпадают
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="pt-2">
              <Button
                type="submit"
                className="w-full h-11 text-base font-medium"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Сохранить новый пароль'
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Security note */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          После смены пароля вам потребуется войти заново
        </p>
      </div>
    </div>
  );
}
