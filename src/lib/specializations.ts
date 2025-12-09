/**
 * Specializations utility functions
 * Provides mapping between specialization codes and display names
 */

export const SPECIALIZATIONS = {
  psychiatrist: 'Психиатр',
  psychologist: 'Психолог',
  neurologist: 'Невролог',
  neuropsychologist: 'Нейропсихолог',
  psychotherapist: 'Психотерапевт',
  clinical_psychologist: 'Клинический психолог',
  child_psychologist: 'Детский психолог',
  family_therapist: 'Семейный терапевт',
  group_therapist: 'Групповой терапевт',
} as const;

export type SpecializationCode = keyof typeof SPECIALIZATIONS;

/**
 * Get human-readable name for specialization code
 */
export function getSpecializationName(code: string | null | undefined): string {
  if (!code) return 'Не указана';
  return SPECIALIZATIONS[code as SpecializationCode] || code;
}

/**
 * Get list of all specializations for select dropdowns
 */
export function getSpecializationList() {
  return Object.entries(SPECIALIZATIONS).map(([code, name]) => ({
    code,
    name,
  }));
}

/**
 * Check if specialization code is valid
 */
export function isValidSpecialization(code: string | null | undefined): boolean {
  if (!code) return false;
  return code in SPECIALIZATIONS;
}

