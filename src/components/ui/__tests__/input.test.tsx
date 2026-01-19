import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../input';

describe('Input', () => {
  describe('rendering', () => {
    it('should render an input element', () => {
      render(<Input />);

      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render with type text when specified', () => {
      render(<Input type="text" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'text');
    });

    it('should apply custom className', () => {
      render(<Input className="custom-class" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('custom-class');
    });

    it('should merge base styles with custom className', () => {
      render(<Input className="custom-class" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('custom-class');
      expect(input).toHaveClass('rounded-md');
      expect(input).toHaveClass('border');
    });
  });

  describe('input types', () => {
    it('should render text input', () => {
      render(<Input type="text" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'text');
    });

    it('should render email input', () => {
      render(<Input type="email" aria-label="Email" />);

      const input = screen.getByLabelText('Email');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('should render password input', () => {
      render(<Input type="password" aria-label="Password" />);

      const input = screen.getByLabelText('Password');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should render number input', () => {
      render(<Input type="number" aria-label="Number" />);

      const input = screen.getByLabelText('Number');
      expect(input).toHaveAttribute('type', 'number');
    });

    it('should render tel input', () => {
      render(<Input type="tel" aria-label="Phone" />);

      const input = screen.getByLabelText('Phone');
      expect(input).toHaveAttribute('type', 'tel');
    });

    it('should render search input', () => {
      render(<Input type="search" aria-label="Search" />);

      const input = screen.getByLabelText('Search');
      expect(input).toHaveAttribute('type', 'search');
    });
  });

  describe('interaction', () => {
    it('should handle onChange events', async () => {
      const handleChange = vi.fn();
      render(<Input onChange={handleChange} />);

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'test');

      expect(handleChange).toHaveBeenCalled();
    });

    it('should handle value changes', async () => {
      const user = userEvent.setup();
      render(<Input />);

      const input = screen.getByRole('textbox');
      await user.type(input, 'Hello World');

      expect(input).toHaveValue('Hello World');
    });

    it('should handle focus events', () => {
      const handleFocus = vi.fn();
      render(<Input onFocus={handleFocus} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      expect(handleFocus).toHaveBeenCalled();
    });

    it('should handle blur events', () => {
      const handleBlur = vi.fn();
      render(<Input onBlur={handleBlur} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(handleBlur).toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should render disabled input', () => {
      render(<Input disabled />);

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('should have disabled styles', () => {
      render(<Input disabled />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('disabled:cursor-not-allowed');
      expect(input).toHaveClass('disabled:opacity-50');
    });

    it('should not allow typing when disabled', async () => {
      const handleChange = vi.fn();
      render(<Input disabled onChange={handleChange} />);

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'test');

      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  describe('placeholder', () => {
    it('should render placeholder text', () => {
      render(<Input placeholder="Enter text..." />);

      const input = screen.getByPlaceholderText('Enter text...');
      expect(input).toBeInTheDocument();
    });
  });

  describe('HTML attributes', () => {
    it('should pass through id attribute', () => {
      render(<Input id="unique-input" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('id', 'unique-input');
    });

    it('should pass through name attribute', () => {
      render(<Input name="email" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('name', 'email');
    });

    it('should pass through required attribute', () => {
      render(<Input required />);

      const input = screen.getByRole('textbox');
      expect(input).toBeRequired();
    });

    it('should pass through maxLength attribute', () => {
      render(<Input maxLength={50} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('maxLength', '50');
    });

    it('should pass through minLength attribute', () => {
      render(<Input minLength={5} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('minLength', '5');
    });

    it('should pass through autoComplete attribute', () => {
      render(<Input autoComplete="email" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('autoComplete', 'email');
    });

    it('should pass through readOnly attribute', () => {
      render(<Input readOnly />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('readOnly');
    });

    it('should pass through aria-label attribute', () => {
      render(<Input aria-label="Search query" />);

      const input = screen.getByLabelText('Search query');
      expect(input).toBeInTheDocument();
    });

    it('should pass through aria-describedby attribute', () => {
      render(<Input aria-describedby="help-text" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby', 'help-text');
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to input element', () => {
      const ref = vi.fn();
      render(<Input ref={ref} />);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLInputElement);
    });

    it('should allow focus via ref', () => {
      const ref = { current: null as HTMLInputElement | null };
      render(<Input ref={ref} />);

      ref.current?.focus();

      expect(document.activeElement).toBe(ref.current);
    });
  });

  describe('display name', () => {
    it('should have correct displayName', () => {
      expect(Input.displayName).toBe('Input');
    });
  });

  describe('styling', () => {
    it('should have base styling classes', () => {
      render(<Input />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('flex');
      expect(input).toHaveClass('h-10');
      expect(input).toHaveClass('w-full');
      expect(input).toHaveClass('rounded-md');
      expect(input).toHaveClass('border');
      expect(input).toHaveClass('border-input');
      expect(input).toHaveClass('bg-background');
      expect(input).toHaveClass('px-3');
      expect(input).toHaveClass('py-2');
    });

    it('should have focus styles', () => {
      render(<Input />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('focus-visible:outline-none');
      expect(input).toHaveClass('focus-visible:ring-2');
      expect(input).toHaveClass('focus-visible:ring-ring');
    });
  });

  describe('controlled vs uncontrolled', () => {
    it('should work as controlled input', async () => {
      const handleChange = vi.fn();
      render(<Input value="controlled" onChange={handleChange} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('controlled');
    });

    it('should work as uncontrolled input', async () => {
      render(<Input defaultValue="initial" />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('initial');

      await userEvent.clear(input);
      await userEvent.type(input, 'changed');

      expect(input).toHaveValue('changed');
    });
  });
});
