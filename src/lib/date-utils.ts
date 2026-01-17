import { format, formatDistanceToNow, formatRelative } from 'date-fns';
import { ru } from 'date-fns/locale';

/**
 * Format date as relative time (e.g., "2 hours ago", "yesterday")
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return '—';
    }
    
    // Use Russian locale for relative time
    return formatDistanceToNow(dateObj, { addSuffix: true, locale: ru });
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return '—';
  }
}

/**
 * Format date for display (e.g., "15 Jan 2024")
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      return '—';
    }
    
    return format(dateObj, 'd MMM yyyy', { locale: ru });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '—';
  }
}

/**
 * Format date and time for display
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      return '—';
    }
    
    return format(dateObj, 'd MMM yyyy, HH:mm', { locale: ru });
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return '—';
  }
}







