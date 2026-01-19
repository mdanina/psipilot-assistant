import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, formatDate, formatDateTime } from '../date-utils';

describe('date-utils', () => {
  // Mock console.error to suppress error logs in tests
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    consoleSpy.mockClear();
  });

  describe('formatRelativeTime', () => {
    it('should return "—" for null input', () => {
      expect(formatRelativeTime(null)).toBe('—');
    });

    it('should return "—" for undefined input', () => {
      expect(formatRelativeTime(undefined)).toBe('—');
    });

    it('should return "—" for empty string', () => {
      expect(formatRelativeTime('')).toBe('—');
    });

    it('should return "—" for invalid date string', () => {
      expect(formatRelativeTime('not-a-date')).toBe('—');
    });

    it('should format a recent date', () => {
      const now = new Date();
      const result = formatRelativeTime(now);
      // Should contain Russian relative time suffix
      expect(result).not.toBe('—');
      expect(typeof result).toBe('string');
    });

    it('should handle Date object input', () => {
      const date = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const result = formatRelativeTime(date);
      expect(result).not.toBe('—');
    });

    it('should handle ISO string input', () => {
      const date = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
      const result = formatRelativeTime(date);
      expect(result).not.toBe('—');
    });

    it('should include suffix (назад)', () => {
      const date = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const result = formatRelativeTime(date);
      expect(result).toContain('назад');
    });
  });

  describe('formatDate', () => {
    it('should return "—" for null input', () => {
      expect(formatDate(null)).toBe('—');
    });

    it('should return "—" for undefined input', () => {
      expect(formatDate(undefined)).toBe('—');
    });

    it('should return "—" for empty string', () => {
      expect(formatDate('')).toBe('—');
    });

    it('should return "—" for invalid date string', () => {
      expect(formatDate('invalid-date')).toBe('—');
    });

    it('should format a valid date string', () => {
      const result = formatDate('2024-01-15');
      expect(result).toMatch(/15.*(янв|Jan).*2024/i);
    });

    it('should format a Date object', () => {
      const date = new Date(2024, 0, 15); // January 15, 2024
      const result = formatDate(date);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2024/);
    });

    it('should format ISO string', () => {
      const result = formatDate('2024-06-20T10:30:00Z');
      expect(result).toMatch(/20/);
      expect(result).toMatch(/2024/);
    });

    it('should use Russian locale', () => {
      const result = formatDate('2024-03-15');
      // Should contain Russian month name
      expect(result).toMatch(/(мар|март)/i);
    });
  });

  describe('formatDateTime', () => {
    it('should return "—" for null input', () => {
      expect(formatDateTime(null)).toBe('—');
    });

    it('should return "—" for undefined input', () => {
      expect(formatDateTime(undefined)).toBe('—');
    });

    it('should return "—" for empty string', () => {
      expect(formatDateTime('')).toBe('—');
    });

    it('should return "—" for invalid date string', () => {
      expect(formatDateTime('not-valid')).toBe('—');
    });

    it('should format date and time', () => {
      const date = new Date(2024, 5, 15, 14, 30); // June 15, 2024, 14:30
      const result = formatDateTime(date);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/14:30/);
    });

    it('should format ISO string with time', () => {
      const result = formatDateTime('2024-01-20T09:15:00Z');
      expect(result).toMatch(/20/);
      expect(result).toMatch(/2024/);
      // Time might be different depending on timezone
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('should include date and time parts', () => {
      const result = formatDateTime(new Date(2024, 11, 25, 18, 45));
      // Should have day, month, year, and time
      expect(result).toMatch(/25/);
      expect(result).toMatch(/2024/);
      expect(result).toMatch(/18:45/);
    });
  });

  describe('edge cases', () => {
    it('should handle very old dates', () => {
      const oldDate = new Date(1900, 0, 1);
      expect(formatDate(oldDate)).not.toBe('—');
      expect(formatDateTime(oldDate)).not.toBe('—');
    });

    it('should handle future dates', () => {
      const futureDate = new Date(2100, 11, 31);
      expect(formatDate(futureDate)).not.toBe('—');
      expect(formatDateTime(futureDate)).not.toBe('—');
    });

    it('should handle date at midnight', () => {
      const midnight = new Date(2024, 5, 15, 0, 0, 0);
      const result = formatDateTime(midnight);
      expect(result).toMatch(/00:00/);
    });

    it('should handle date at end of day', () => {
      const endOfDay = new Date(2024, 5, 15, 23, 59, 59);
      const result = formatDateTime(endOfDay);
      expect(result).toMatch(/23:59/);
    });
  });
});
