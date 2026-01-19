import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from '../badge';

describe('Badge', () => {
  describe('rendering', () => {
    it('should render a div element', () => {
      render(<Badge>Badge</Badge>);

      expect(screen.getByText('Badge')).toBeInTheDocument();
    });

    it('should render children correctly', () => {
      render(<Badge>Test Badge</Badge>);

      expect(screen.getByText('Test Badge')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<Badge className="custom-class">Badge</Badge>);

      const badge = screen.getByText('Badge');
      expect(badge).toHaveClass('custom-class');
    });

    it('should render with multiple children', () => {
      render(
        <Badge>
          <span>Icon</span>
          <span>Text</span>
        </Badge>
      );

      expect(screen.getByText('Icon')).toBeInTheDocument();
      expect(screen.getByText('Text')).toBeInTheDocument();
    });
  });

  describe('variants', () => {
    it('should apply default variant styles', () => {
      render(<Badge variant="default">Default</Badge>);

      const badge = screen.getByText('Default');
      expect(badge).toHaveClass('bg-primary');
      expect(badge).toHaveClass('text-primary-foreground');
    });

    it('should apply secondary variant styles', () => {
      render(<Badge variant="secondary">Secondary</Badge>);

      const badge = screen.getByText('Secondary');
      expect(badge).toHaveClass('bg-secondary');
      expect(badge).toHaveClass('text-secondary-foreground');
    });

    it('should apply destructive variant styles', () => {
      render(<Badge variant="destructive">Error</Badge>);

      const badge = screen.getByText('Error');
      expect(badge).toHaveClass('bg-destructive');
      expect(badge).toHaveClass('text-destructive-foreground');
    });

    it('should apply outline variant styles', () => {
      render(<Badge variant="outline">Outline</Badge>);

      const badge = screen.getByText('Outline');
      expect(badge).toHaveClass('text-foreground');
    });

    it('should apply default variant when no variant specified', () => {
      render(<Badge>No Variant</Badge>);

      const badge = screen.getByText('No Variant');
      expect(badge).toHaveClass('bg-primary');
    });
  });

  describe('base styles', () => {
    it('should have base styling classes', () => {
      render(<Badge>Badge</Badge>);

      const badge = screen.getByText('Badge');
      expect(badge).toHaveClass('inline-flex');
      expect(badge).toHaveClass('items-center');
      expect(badge).toHaveClass('rounded-full');
      expect(badge).toHaveClass('border');
      expect(badge).toHaveClass('px-2.5');
      expect(badge).toHaveClass('py-0.5');
      expect(badge).toHaveClass('text-xs');
      expect(badge).toHaveClass('font-semibold');
    });

    it('should have focus styles', () => {
      render(<Badge>Badge</Badge>);

      const badge = screen.getByText('Badge');
      expect(badge).toHaveClass('focus:outline-none');
      expect(badge).toHaveClass('focus:ring-2');
    });

    it('should have transition styles', () => {
      render(<Badge>Badge</Badge>);

      const badge = screen.getByText('Badge');
      expect(badge).toHaveClass('transition-colors');
    });
  });

  describe('HTML attributes', () => {
    it('should pass through id attribute', () => {
      render(<Badge id="unique-badge">Badge</Badge>);

      const badge = screen.getByText('Badge');
      expect(badge).toHaveAttribute('id', 'unique-badge');
    });

    it('should pass through data attributes', () => {
      render(<Badge data-testid="badge-test">Badge</Badge>);

      expect(screen.getByTestId('badge-test')).toBeInTheDocument();
    });

    it('should pass through aria attributes', () => {
      render(<Badge aria-label="Status badge">Badge</Badge>);

      const badge = screen.getByLabelText('Status badge');
      expect(badge).toBeInTheDocument();
    });

    it('should pass through title attribute', () => {
      render(<Badge title="Badge tooltip">Badge</Badge>);

      const badge = screen.getByText('Badge');
      expect(badge).toHaveAttribute('title', 'Badge tooltip');
    });
  });

  describe('badgeVariants', () => {
    it('should generate correct classes for default variant', () => {
      const classes = badgeVariants({ variant: 'default' });

      expect(classes).toContain('bg-primary');
      expect(classes).toContain('text-primary-foreground');
    });

    it('should generate correct classes for secondary variant', () => {
      const classes = badgeVariants({ variant: 'secondary' });

      expect(classes).toContain('bg-secondary');
      expect(classes).toContain('text-secondary-foreground');
    });

    it('should generate correct classes for destructive variant', () => {
      const classes = badgeVariants({ variant: 'destructive' });

      expect(classes).toContain('bg-destructive');
      expect(classes).toContain('text-destructive-foreground');
    });

    it('should generate correct classes for outline variant', () => {
      const classes = badgeVariants({ variant: 'outline' });

      expect(classes).toContain('text-foreground');
    });

    it('should include base classes in all variants', () => {
      const variants = ['default', 'secondary', 'destructive', 'outline'] as const;

      for (const variant of variants) {
        const classes = badgeVariants({ variant });
        expect(classes).toContain('inline-flex');
        expect(classes).toContain('items-center');
        expect(classes).toContain('rounded-full');
      }
    });
  });

  describe('use cases', () => {
    it('should work for status indicators', () => {
      render(
        <div>
          <Badge variant="default">Active</Badge>
          <Badge variant="secondary">Pending</Badge>
          <Badge variant="destructive">Inactive</Badge>
        </div>
      );

      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('should work for counts', () => {
      render(<Badge>99+</Badge>);

      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('should work for tags/labels', () => {
      render(
        <div>
          <Badge variant="outline">JavaScript</Badge>
          <Badge variant="outline">TypeScript</Badge>
        </div>
      );

      expect(screen.getByText('JavaScript')).toBeInTheDocument();
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });
  });
});
