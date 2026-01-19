import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, buttonVariants } from '../button';

describe('Button', () => {
  describe('rendering', () => {
    it('should render a button element by default', () => {
      render(<Button>Click me</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe('BUTTON');
    });

    it('should render children correctly', () => {
      render(<Button>Test Button</Button>);

      expect(screen.getByText('Test Button')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      render(<Button className="custom-class">Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });
  });

  describe('variants', () => {
    it('should apply default variant styles', () => {
      render(<Button variant="default">Default</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary');
    });

    it('should apply destructive variant styles', () => {
      render(<Button variant="destructive">Delete</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive');
    });

    it('should apply outline variant styles', () => {
      render(<Button variant="outline">Outline</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('border');
      expect(button).toHaveClass('border-input');
    });

    it('should apply secondary variant styles', () => {
      render(<Button variant="secondary">Secondary</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-secondary');
    });

    it('should apply ghost variant styles', () => {
      render(<Button variant="ghost">Ghost</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('hover:bg-accent');
    });

    it('should apply link variant styles', () => {
      render(<Button variant="link">Link</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('text-primary');
      expect(button).toHaveClass('underline-offset-4');
    });
  });

  describe('sizes', () => {
    it('should apply default size', () => {
      render(<Button size="default">Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-10');
      expect(button).toHaveClass('px-4');
    });

    it('should apply small size', () => {
      render(<Button size="sm">Small</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-9');
      expect(button).toHaveClass('px-3');
    });

    it('should apply large size', () => {
      render(<Button size="lg">Large</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-11');
      expect(button).toHaveClass('px-8');
    });

    it('should apply icon size', () => {
      render(<Button size="icon">🔍</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-10');
      expect(button).toHaveClass('w-10');
    });
  });

  describe('asChild', () => {
    it('should render as child element when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );

      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
    });
  });

  describe('interaction', () => {
    it('should call onClick when clicked', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', () => {
      const handleClick = vi.fn();
      render(
        <Button onClick={handleClick} disabled>
          Disabled
        </Button>
      );

      fireEvent.click(screen.getByRole('button'));

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should have disabled attribute when disabled', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should have disabled styles', () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('disabled:pointer-events-none');
      expect(button).toHaveClass('disabled:opacity-50');
    });
  });

  describe('HTML attributes', () => {
    it('should pass through type attribute', () => {
      render(<Button type="submit">Submit</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'submit');
    });

    it('should pass through name attribute', () => {
      render(<Button name="testButton">Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('name', 'testButton');
    });

    it('should pass through id attribute', () => {
      render(<Button id="unique-id">Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('id', 'unique-id');
    });

    it('should pass through aria-label attribute', () => {
      render(<Button aria-label="Close dialog">X</Button>);

      const button = screen.getByRole('button', { name: 'Close dialog' });
      expect(button).toBeInTheDocument();
    });
  });

  describe('buttonVariants', () => {
    it('should generate correct classes for default variant and size', () => {
      const classes = buttonVariants({ variant: 'default', size: 'default' });

      expect(classes).toContain('bg-primary');
      expect(classes).toContain('h-10');
    });

    it('should generate correct classes for destructive variant', () => {
      const classes = buttonVariants({ variant: 'destructive' });

      expect(classes).toContain('bg-destructive');
    });

    it('should allow custom className to be merged', () => {
      const classes = buttonVariants({ className: 'custom-class' });

      expect(classes).toContain('custom-class');
    });
  });

  describe('ref forwarding', () => {
    it('should forward ref to button element', () => {
      const ref = vi.fn();
      render(<Button ref={ref}>Button</Button>);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe('display name', () => {
    it('should have correct displayName', () => {
      expect(Button.displayName).toBe('Button');
    });
  });
});
