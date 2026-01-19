import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../card';

describe('Card components', () => {
  describe('Card', () => {
    it('should render a div element', () => {
      render(<Card>Card content</Card>);

      expect(screen.getByText('Card content')).toBeInTheDocument();
    });

    it('should apply base styles', () => {
      render(<Card data-testid="card">Content</Card>);

      const card = screen.getByTestId('card');
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('bg-card');
      expect(card).toHaveClass('text-card-foreground');
      expect(card).toHaveClass('shadow-sm');
    });

    it('should accept custom className', () => {
      render(<Card className="custom-class">Content</Card>);

      const card = screen.getByText('Content');
      expect(card).toHaveClass('custom-class');
    });

    it('should forward ref', () => {
      const ref = vi.fn();
      render(<Card ref={ref}>Content</Card>);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });

    it('should have correct displayName', () => {
      expect(Card.displayName).toBe('Card');
    });
  });

  describe('CardHeader', () => {
    it('should render a div element', () => {
      render(<CardHeader data-testid="header">Header content</CardHeader>);

      expect(screen.getByTestId('header')).toBeInTheDocument();
    });

    it('should apply base styles', () => {
      render(<CardHeader data-testid="header">Content</CardHeader>);

      const header = screen.getByTestId('header');
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('flex-col');
      expect(header).toHaveClass('space-y-1.5');
      expect(header).toHaveClass('p-6');
    });

    it('should accept custom className', () => {
      render(<CardHeader className="custom-class">Content</CardHeader>);

      const header = screen.getByText('Content');
      expect(header).toHaveClass('custom-class');
    });

    it('should forward ref', () => {
      const ref = vi.fn();
      render(<CardHeader ref={ref}>Content</CardHeader>);

      expect(ref).toHaveBeenCalled();
    });

    it('should have correct displayName', () => {
      expect(CardHeader.displayName).toBe('CardHeader');
    });
  });

  describe('CardTitle', () => {
    it('should render an h3 element', () => {
      render(<CardTitle>Title</CardTitle>);

      expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    });

    it('should apply base styles', () => {
      render(<CardTitle>Title</CardTitle>);

      const title = screen.getByText('Title');
      expect(title).toHaveClass('text-2xl');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveClass('tracking-tight');
    });

    it('should accept custom className', () => {
      render(<CardTitle className="custom-class">Title</CardTitle>);

      const title = screen.getByText('Title');
      expect(title).toHaveClass('custom-class');
    });

    it('should forward ref', () => {
      const ref = vi.fn();
      render(<CardTitle ref={ref}>Title</CardTitle>);

      expect(ref).toHaveBeenCalled();
    });

    it('should have correct displayName', () => {
      expect(CardTitle.displayName).toBe('CardTitle');
    });
  });

  describe('CardDescription', () => {
    it('should render a p element', () => {
      render(<CardDescription>Description</CardDescription>);

      expect(screen.getByText('Description').tagName).toBe('P');
    });

    it('should apply base styles', () => {
      render(<CardDescription>Description</CardDescription>);

      const description = screen.getByText('Description');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });

    it('should accept custom className', () => {
      render(<CardDescription className="custom-class">Description</CardDescription>);

      const description = screen.getByText('Description');
      expect(description).toHaveClass('custom-class');
    });

    it('should forward ref', () => {
      const ref = vi.fn();
      render(<CardDescription ref={ref}>Description</CardDescription>);

      expect(ref).toHaveBeenCalled();
    });

    it('should have correct displayName', () => {
      expect(CardDescription.displayName).toBe('CardDescription');
    });
  });

  describe('CardContent', () => {
    it('should render a div element', () => {
      render(<CardContent data-testid="content">Content</CardContent>);

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('should apply base styles', () => {
      render(<CardContent data-testid="content">Content</CardContent>);

      const content = screen.getByTestId('content');
      expect(content).toHaveClass('p-6');
      expect(content).toHaveClass('pt-0');
    });

    it('should accept custom className', () => {
      render(<CardContent className="custom-class">Content</CardContent>);

      const content = screen.getByText('Content');
      expect(content).toHaveClass('custom-class');
    });

    it('should forward ref', () => {
      const ref = vi.fn();
      render(<CardContent ref={ref}>Content</CardContent>);

      expect(ref).toHaveBeenCalled();
    });

    it('should have correct displayName', () => {
      expect(CardContent.displayName).toBe('CardContent');
    });
  });

  describe('CardFooter', () => {
    it('should render a div element', () => {
      render(<CardFooter data-testid="footer">Footer</CardFooter>);

      expect(screen.getByTestId('footer')).toBeInTheDocument();
    });

    it('should apply base styles', () => {
      render(<CardFooter data-testid="footer">Footer</CardFooter>);

      const footer = screen.getByTestId('footer');
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
      expect(footer).toHaveClass('p-6');
      expect(footer).toHaveClass('pt-0');
    });

    it('should accept custom className', () => {
      render(<CardFooter className="custom-class">Footer</CardFooter>);

      const footer = screen.getByText('Footer');
      expect(footer).toHaveClass('custom-class');
    });

    it('should forward ref', () => {
      const ref = vi.fn();
      render(<CardFooter ref={ref}>Footer</CardFooter>);

      expect(ref).toHaveBeenCalled();
    });

    it('should have correct displayName', () => {
      expect(CardFooter.displayName).toBe('CardFooter');
    });
  });

  describe('Card composition', () => {
    it('should render a complete card structure', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card description text</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Main card content here</p>
          </CardContent>
          <CardFooter>
            <button>Action</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Card Title');
      expect(screen.getByText('Card description text')).toBeInTheDocument();
      expect(screen.getByText('Main card content here')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });

    it('should allow partial card composition', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Simple Card</CardTitle>
          </CardHeader>
          <CardContent>Content only</CardContent>
        </Card>
      );

      expect(screen.getByText('Simple Card')).toBeInTheDocument();
      expect(screen.getByText('Content only')).toBeInTheDocument();
    });

    it('should work with just Card and CardContent', () => {
      render(
        <Card>
          <CardContent>Just content</CardContent>
        </Card>
      );

      expect(screen.getByText('Just content')).toBeInTheDocument();
    });
  });

  describe('HTML attributes', () => {
    it('should pass through data attributes to Card', () => {
      render(<Card data-testid="test-card">Content</Card>);

      expect(screen.getByTestId('test-card')).toBeInTheDocument();
    });

    it('should pass through aria attributes', () => {
      render(
        <Card aria-label="Information card">
          <CardContent>Content</CardContent>
        </Card>
      );

      expect(screen.getByLabelText('Information card')).toBeInTheDocument();
    });

    it('should pass through id attribute', () => {
      render(<Card id="unique-card">Content</Card>);

      const card = screen.getByText('Content');
      expect(card).toHaveAttribute('id', 'unique-card');
    });
  });
});
