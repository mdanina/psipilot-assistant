import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const requirements: PasswordRequirement[] = [
  { label: 'Минимум 8 символов', test: (p) => p.length >= 8 },
  { label: 'Заглавная буква', test: (p) => /[A-ZА-ЯЁ]/.test(p) },
  { label: 'Строчная буква', test: (p) => /[a-zа-яё]/.test(p) },
  { label: 'Цифра', test: (p) => /\d/.test(p) },
  { label: 'Спецсимвол (!@#$%^&*)', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export function PasswordStrengthIndicator({ password, className }: PasswordStrengthIndicatorProps) {
  const { strength, passedRequirements, strengthLabel, strengthColor } = useMemo(() => {
    if (!password) {
      return {
        strength: 0,
        passedRequirements: [] as boolean[],
        strengthLabel: '',
        strengthColor: 'bg-muted',
      };
    }

    const passed = requirements.map((req) => req.test(password));
    const passedCount = passed.filter(Boolean).length;
    const strengthPercent = (passedCount / requirements.length) * 100;

    let label = '';
    let color = '';

    if (strengthPercent < 40) {
      label = 'Слабый';
      color = 'bg-red-500';
    } else if (strengthPercent < 60) {
      label = 'Средний';
      color = 'bg-orange-500';
    } else if (strengthPercent < 80) {
      label = 'Хороший';
      color = 'bg-yellow-500';
    } else {
      label = 'Надёжный';
      color = 'bg-green-500';
    }

    return {
      strength: strengthPercent,
      passedRequirements: passed,
      strengthLabel: label,
      strengthColor: color,
    };
  }, [password]);

  if (!password) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Надёжность пароля</span>
          <span className={cn(
            'font-medium',
            strength < 40 && 'text-red-500',
            strength >= 40 && strength < 60 && 'text-orange-500',
            strength >= 60 && strength < 80 && 'text-yellow-500',
            strength >= 80 && 'text-green-500'
          )}>
            {strengthLabel}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300 ease-out rounded-full', strengthColor)}
            style={{ width: `${strength}%` }}
          />
        </div>
      </div>

      {/* Requirements checklist */}
      <div className="grid grid-cols-1 gap-1.5">
        {requirements.map((req, index) => (
          <div
            key={req.label}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              passedRequirements[index] ? 'text-green-600' : 'text-muted-foreground'
            )}
          >
            {passedRequirements[index] ? (
              <Check className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/50" />
            )}
            <span>{req.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function isPasswordStrong(password: string): boolean {
  return requirements.every((req) => req.test(password));
}

export function getPasswordStrength(password: string): number {
  if (!password) return 0;
  const passed = requirements.filter((req) => req.test(password)).length;
  return (passed / requirements.length) * 100;
}
