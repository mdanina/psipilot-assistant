import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { ShrimpIcon } from '@/components/ShrimpIcon';

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
            setError('Недействительная или истёкшая ссылка для сброса пароля. Пожалуйста, запросите новую ссылку.');
            setIsValidToken(false);
          } else {
            setIsValidToken(true);
          }
        } catch (err) {
          console.error('Token verification exception:', err);
          setError('Ошибка при проверке ссылки. Пожалуйста, запросите новую ссылку.');
          setIsValidToken(false);
        }
      } else if (hash && hash.includes('type=recovery')) {
        // Token from hash fragment (standard Supabase format)
        // Supabase client handles this automatically
        setIsValidToken(true);
      } else {
        setError('Недействительная или истёкшая ссылка для сброса пароля. Пожалуйста, запросите новую ссылку.');
        setIsValidToken(false);
      }

      setIsLoading(false);
    };

    verifyToken();
  }, [searchParams]);

  const validatePassword = (): string | null => {
    if (password.length < 8) {
      return 'Пароль должен содержать минимум 8 символов';
    }
    if (password !== confirmPassword) {
      return 'Пароли не совпадают';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validatePassword();
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
        setError(error.message);
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Пароль изменён</CardTitle>
            <CardDescription>
              Ваш пароль успешно обновлён. Сейчас вы будете перенаправлены на страницу входа.
            </CardDescription>
          </CardHeader>

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShrimpIcon className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Новый пароль</CardTitle>
          <CardDescription>
            Придумайте новый надёжный пароль для вашего аккаунта
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
              <Label htmlFor="password">Новый пароль</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Минимум 8 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isSubmitting || !isValidToken}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={isSubmitting || !isValidToken}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Пароль должен содержать минимум 8 символов
            </p>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !isValidToken}
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
    </div>
  );
}
