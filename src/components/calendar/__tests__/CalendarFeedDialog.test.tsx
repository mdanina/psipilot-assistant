import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CalendarFeedDialog } from '../CalendarFeedDialog';

const mockGenerateCalendarFeedToken = vi.fn();
const mockRevokeCalendarFeedToken = vi.fn();
const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock('@/lib/calendar-feed', () => ({
  generateCalendarFeedToken: (...args: unknown[]) => mockGenerateCalendarFeedToken(...args),
  revokeCalendarFeedToken: (...args: unknown[]) => mockRevokeCalendarFeedToken(...args),
  toGoogleCalendarUrl: (feedUrl: string) =>
    `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl.replace(/^https?:\/\//, 'webcal://'))}`,
  toWebcalUrl: (feedUrl: string) => feedUrl.replace(/^https?:\/\//, 'webcal://'),
}));

describe('CalendarFeedDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trigger button', () => {
    render(<CalendarFeedDialog />);
    expect(screen.getByRole('button', { name: /Подписка на календарь/i })).toBeInTheDocument();
  });

  it('creates feed link and shows direct calendar actions', async () => {
    mockGenerateCalendarFeedToken.mockResolvedValue({
      token: 'token-123',
      feedUrl: 'https://example.com/api/calendar/feed/token-123',
    });

    render(<CalendarFeedDialog />);

    fireEvent.click(screen.getByRole('button', { name: /Подписка на календарь/i }));
    fireEvent.click(screen.getByRole('button', { name: /Создать ссылку/i }));

    await waitFor(() => {
      expect(mockGenerateCalendarFeedToken).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('link', { name: /Google Календарь/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Apple \/ другой календарь/i })).toBeInTheDocument();
  });

  it('copies manual feed URL', async () => {
    mockGenerateCalendarFeedToken.mockResolvedValue({
      token: 'token-123',
      feedUrl: 'https://example.com/api/calendar/feed/token-123',
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<CalendarFeedDialog />);

    fireEvent.click(screen.getByRole('button', { name: /Подписка на календарь/i }));
    fireEvent.click(screen.getByRole('button', { name: /Создать ссылку/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Показать ссылку для ручного добавления/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Показать ссылку для ручного добавления/i }));

    const copyButtons = screen.getAllByRole('button');
    const copyButton = copyButtons.find((btn) => btn.getAttribute('title') === 'Копировать ссылку');
    expect(copyButton).toBeDefined();

    fireEvent.click(copyButton!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://example.com/api/calendar/feed/token-123');
    });
  });

  it('revokes existing token and returns to create state', async () => {
    mockGenerateCalendarFeedToken.mockResolvedValue({
      token: 'token-123',
      feedUrl: 'https://example.com/api/calendar/feed/token-123',
    });
    mockRevokeCalendarFeedToken.mockResolvedValue(undefined);

    render(<CalendarFeedDialog />);

    fireEvent.click(screen.getByRole('button', { name: /Подписка на календарь/i }));
    fireEvent.click(screen.getByRole('button', { name: /Создать ссылку/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Обновить ссылку/i })).toBeInTheDocument();
    });

    const revokeButton = screen
      .getAllByRole('button')
      .find((btn) => btn.className.includes('text-destructive'));
    expect(revokeButton).toBeDefined();
    fireEvent.click(revokeButton!);

    await waitFor(() => {
      expect(mockRevokeCalendarFeedToken).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('button', { name: /Создать ссылку/i })).toBeInTheDocument();
  });
});
