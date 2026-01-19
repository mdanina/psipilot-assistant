import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('cn (className utility)', () => {
  it('should merge class names correctly', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    expect(cn('foo', true && 'bar', 'baz')).toBe('foo bar baz');
  });

  it('should handle undefined and null values', () => {
    expect(cn('foo', undefined, 'bar')).toBe('foo bar');
    expect(cn('foo', null, 'bar')).toBe('foo bar');
  });

  it('should handle arrays of class names', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('should handle objects with boolean values', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('should merge Tailwind classes correctly', () => {
    // twMerge should handle conflicting Tailwind classes
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
  });

  it('should handle complex combinations', () => {
    expect(cn(
      'base-class',
      { 'conditional-class': true, 'another-class': false },
      ['array-class'],
      undefined,
      'final-class'
    )).toBe('base-class conditional-class array-class final-class');
  });

  it('should handle Tailwind responsive classes', () => {
    expect(cn('md:px-2', 'md:px-4')).toBe('md:px-4');
    expect(cn('lg:text-sm', 'lg:text-lg')).toBe('lg:text-lg');
  });

  it('should handle Tailwind state classes', () => {
    expect(cn('hover:bg-red-500', 'hover:bg-blue-500')).toBe('hover:bg-blue-500');
    expect(cn('focus:ring-2', 'focus:ring-4')).toBe('focus:ring-4');
  });

  it('should preserve non-conflicting classes', () => {
    expect(cn('flex items-center', 'justify-between')).toBe('flex items-center justify-between');
  });
});
