import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { AlertCircle, Mail, Loader2, CheckCircle2, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const RESEND_COOLDOWN = 60; // seconds

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = (location.state as { email?: string })?.email || '';

  const [otpValue, setOtpValue] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Redirect if no email
  useEffect(() => {
    if (!emailFromState) {
      toast.error('Email не найден. Зарегистрируйтесь снова.');
      navigate('/register', { replace: true });
    }
  }, [emailFromState, navigate]);

  // Auto-verify when 6 digits entered
  const handleOtpChange = useCallback((value: string) => {
    setOtpValue(value);
    setError(null);
    if (value.length === 6) {
      handleVerify(value);
    }
  }, []);

  const handleVerify = async (code: string) => {
    if (code.length !== 6) {
      setError('Введите 6-значный код');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: emailFromState,
        token: code,
        type: 'signup',
      });

      if (verifyError) {
        if (verifyError.message?.toLowerCase().includes('expired')) {
          setError('Код истёк. Запросите новый.');
        } else if (verifyError.message?.toLowerCase().includes('invalid') || verifyError.message?.toLowerCase().includes('token')) {
          setError('Неверный код. Проверьте и попробуйте снова.');
        } else {
          setError(verifyError.message || 'Ошибка подтверждения');
        }
        setOtpValue('');
        return;
      }

      if (data?.session) {
        setIsSuccess(true);
        toast.success('Email успешно подтверждён!');
        setTimeout(() => navigate('/', { replace: true }), 1500);
      } else {
        setError('Не удалось создать сессию. Попробуйте войти.');
      }
    } catch (err) {
      setError('Произошла ошибка. Попробуйте снова.');
      setOtpValue('');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !emailFromState) return;

    setIsResending(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: emailFromState,
      });

      if (error) {
        if (error.message?.toLowerCase().includes('rate limit')) {
          toast.error('Слишком много запросов. Подождите немного.');
        } else {
          toast.error(error.message || 'Не удалось отправить код');
        }
        return;
      }

      toast.success('Новый код отправлен на вашу почту');
      setResendCooldown(RESEND_COOLDOWN);
      setOtpValue('');
    } catch (err) {
      toast.error('Ошибка при отправке кода');
    } finally {
      setIsResending(false);
    }
  };

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
            <CardTitle className="text-2xl font-bold">Email подтверждён!</CardTitle>
            <CardDescription className="text-base">
              Добро пожаловать в Supershrimp
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Перенаправляем в рабочее пространство...
              </p>
              <div className="flex justify-center mt-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        {/* Back link */}
        <div className="mb-6">
          <Link
            to="/register"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к регистрации
          </Link>
        </div>

        <Card className="border-0 shadow-xl">
          <CardHeader className="space-y-1 text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 ring-4 ring-primary/5">
                <Mail className="h-7 w-7 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Подтвердите email</CardTitle>
            <CardDescription>
              Мы отправили 6-значный код на адрес
            </CardDescription>
            <p className="font-medium text-foreground pt-1">{emailFromState}</p>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {/* OTP Input */}
            <div className="flex flex-col items-center gap-4">
              <InputOTP
                maxLength={6}
                value={otpValue}
                onChange={handleOtpChange}
                disabled={isVerifying}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>

              <p className="text-sm text-muted-foreground text-center">
                Введите код из письма или перейдите по ссылке
              </p>
            </div>

            {/* Error message */}
            {error && (
              <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Verify button */}
            <Button
              onClick={() => handleVerify(otpValue)}
              disabled={isVerifying || otpValue.length !== 6}
              className="w-full h-11 text-base font-medium"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Проверка...
                </>
              ) : (
                'Подтвердить'
              )}
            </Button>

            {/* Resend section */}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Не получили код?</p>
              <Button
                variant="ghost"
                onClick={handleResendCode}
                disabled={isResending || resendCooldown > 0}
                className="text-primary"
              >
                {isResending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Отправка...
                  </>
                ) : resendCooldown > 0 ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Повторить через {resendCooldown}с
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Отправить повторно
                  </>
                )}
              </Button>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3 pt-2">
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">или</span>
              </div>
            </div>

            <Link to="/login" className="w-full">
              <Button variant="outline" className="w-full">
                Уже подтвердили? Войти
              </Button>
            </Link>
          </CardFooter>
        </Card>

        {/* Help text */}
        <div className="mt-6 rounded-lg bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground text-center">
            Проверьте папку «Спам», если письмо не приходит.
            <br />
            Код действителен в течение 24 часов.
          </p>
        </div>
      </div>
    </div>
  );
}
