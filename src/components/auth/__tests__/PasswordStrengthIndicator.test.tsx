import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PasswordStrengthIndicator,
  isPasswordStrong,
  getPasswordStrength,
} from '../PasswordStrengthIndicator';

describe('PasswordStrengthIndicator', () => {
  describe('component rendering', () => {
    it('should not render when password is empty', () => {
      const { container } = render(<PasswordStrengthIndicator password="" />);

      expect(container.firstChild).toBeNull();
    });

    it('should render when password is provided', () => {
      render(<PasswordStrengthIndicator password="test" />);

      expect(screen.getByText('Надёжность пароля')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <PasswordStrengthIndicator password="test" className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('password requirements', () => {
    it('should show minimum length requirement', () => {
      render(<PasswordStrengthIndicator password="test" />);

      expect(screen.getByText('Минимум 8 символов')).toBeInTheDocument();
    });

    it('should show uppercase letter requirement', () => {
      render(<PasswordStrengthIndicator password="test" />);

      expect(screen.getByText('Заглавная буква')).toBeInTheDocument();
    });

    it('should show lowercase letter requirement', () => {
      render(<PasswordStrengthIndicator password="test" />);

      expect(screen.getByText('Строчная буква')).toBeInTheDocument();
    });

    it('should show digit requirement', () => {
      render(<PasswordStrengthIndicator password="test" />);

      expect(screen.getByText('Цифра')).toBeInTheDocument();
    });

    it('should show special character requirement', () => {
      render(<PasswordStrengthIndicator password="test" />);

      expect(screen.getByText('Спецсимвол (!@#$%^&*)')).toBeInTheDocument();
    });
  });

  describe('strength labels', () => {
    it('should show "Слабый" for weak passwords', () => {
      render(<PasswordStrengthIndicator password="ab" />);

      expect(screen.getByText('Слабый')).toBeInTheDocument();
    });

    it('should show "Средний" for medium passwords', () => {
      render(<PasswordStrengthIndicator password="abcdefgh" />);

      expect(screen.getByText('Средний')).toBeInTheDocument();
    });

    it('should show "Хороший" for good passwords', () => {
      // 3 requirements met: length, lowercase, digit = 60%
      render(<PasswordStrengthIndicator password="abcdefg1" />);

      expect(screen.getByText('Хороший')).toBeInTheDocument();
    });

    it('should show "Надёжный" for strong passwords', () => {
      render(<PasswordStrengthIndicator password="Abcdefgh1!" />);

      expect(screen.getByText('Надёжный')).toBeInTheDocument();
    });
  });

  describe('requirement validation', () => {
    it('should mark length requirement as passed for 8+ characters', () => {
      render(<PasswordStrengthIndicator password="12345678" />);

      // Find the requirement and check if it has the green color class
      const lengthReq = screen.getByText('Минимум 8 символов').parentElement;
      expect(lengthReq).toHaveClass('text-green-600');
    });

    it('should mark uppercase requirement as passed for uppercase letter', () => {
      render(<PasswordStrengthIndicator password="A" />);

      const uppercaseReq = screen.getByText('Заглавная буква').parentElement;
      expect(uppercaseReq).toHaveClass('text-green-600');
    });

    it('should mark lowercase requirement as passed for lowercase letter', () => {
      render(<PasswordStrengthIndicator password="a" />);

      const lowercaseReq = screen.getByText('Строчная буква').parentElement;
      expect(lowercaseReq).toHaveClass('text-green-600');
    });

    it('should mark digit requirement as passed for number', () => {
      render(<PasswordStrengthIndicator password="1" />);

      const digitReq = screen.getByText('Цифра').parentElement;
      expect(digitReq).toHaveClass('text-green-600');
    });

    it('should mark special char requirement as passed for special character', () => {
      render(<PasswordStrengthIndicator password="!" />);

      const specialReq = screen.getByText('Спецсимвол (!@#$%^&*)').parentElement;
      expect(specialReq).toHaveClass('text-green-600');
    });

    it('should support Cyrillic uppercase letters', () => {
      render(<PasswordStrengthIndicator password="А" />);

      const uppercaseReq = screen.getByText('Заглавная буква').parentElement;
      expect(uppercaseReq).toHaveClass('text-green-600');
    });

    it('should support Cyrillic lowercase letters', () => {
      render(<PasswordStrengthIndicator password="а" />);

      const lowercaseReq = screen.getByText('Строчная буква').parentElement;
      expect(lowercaseReq).toHaveClass('text-green-600');
    });
  });
});

describe('isPasswordStrong', () => {
  it('should return false for empty password', () => {
    expect(isPasswordStrong('')).toBe(false);
  });

  it('should return false for short password', () => {
    expect(isPasswordStrong('Abc1!')).toBe(false);
  });

  it('should return false for password without uppercase', () => {
    expect(isPasswordStrong('abcdefgh1!')).toBe(false);
  });

  it('should return false for password without lowercase', () => {
    expect(isPasswordStrong('ABCDEFGH1!')).toBe(false);
  });

  it('should return false for password without digit', () => {
    expect(isPasswordStrong('Abcdefgh!')).toBe(false);
  });

  it('should return false for password without special character', () => {
    expect(isPasswordStrong('Abcdefgh1')).toBe(false);
  });

  it('should return true for password meeting all requirements', () => {
    expect(isPasswordStrong('Abcdefgh1!')).toBe(true);
  });

  it('should work with Cyrillic characters', () => {
    expect(isPasswordStrong('Абвгдежз1!')).toBe(true);
  });

  it('should work with mixed Cyrillic and Latin', () => {
    expect(isPasswordStrong('АБВabcde1!')).toBe(true);
  });
});

describe('getPasswordStrength', () => {
  it('should return 0 for empty password', () => {
    expect(getPasswordStrength('')).toBe(0);
  });

  it('should return 20% for password with 1 requirement met', () => {
    expect(getPasswordStrength('a')).toBe(20); // only lowercase
  });

  it('should return 40% for password with 2 requirements met', () => {
    expect(getPasswordStrength('aA')).toBe(40); // lowercase + uppercase
  });

  it('should return 60% for password with 3 requirements met', () => {
    expect(getPasswordStrength('aA1')).toBe(60); // lowercase + uppercase + digit
  });

  it('should return 80% for password with 4 requirements met', () => {
    expect(getPasswordStrength('aA1!')).toBe(80); // lowercase + uppercase + digit + special
  });

  it('should return 100% for password with all 5 requirements met', () => {
    expect(getPasswordStrength('aA1!5678')).toBe(100); // all 5 requirements
  });

  it('should calculate correctly for partial requirements', () => {
    expect(getPasswordStrength('12345678')).toBe(40); // length + digit
    expect(getPasswordStrength('abcdefgh')).toBe(40); // length + lowercase
    expect(getPasswordStrength('ABCDEFGH')).toBe(40); // length + uppercase
    expect(getPasswordStrength('!@#$%^&*')).toBe(40); // length + special
  });
});
