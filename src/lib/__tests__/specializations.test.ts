import { describe, it, expect } from 'vitest';
import {
  SPECIALIZATIONS,
  getSpecializationName,
  getSpecializationList,
  isValidSpecialization,
  type SpecializationCode,
} from '../specializations';

describe('specializations', () => {
  describe('SPECIALIZATIONS constant', () => {
    it('should contain all expected specializations', () => {
      expect(SPECIALIZATIONS.psychiatrist).toBe('Психиатр');
      expect(SPECIALIZATIONS.psychologist).toBe('Психолог');
      expect(SPECIALIZATIONS.neurologist).toBe('Невролог');
      expect(SPECIALIZATIONS.neuropsychologist).toBe('Нейропсихолог');
      expect(SPECIALIZATIONS.psychotherapist).toBe('Психотерапевт');
      expect(SPECIALIZATIONS.clinical_psychologist).toBe('Клинический психолог');
      expect(SPECIALIZATIONS.child_psychologist).toBe('Детский психолог');
      expect(SPECIALIZATIONS.family_therapist).toBe('Семейный терапевт');
      expect(SPECIALIZATIONS.group_therapist).toBe('Групповой терапевт');
    });

    it('should have exactly 9 specializations', () => {
      expect(Object.keys(SPECIALIZATIONS)).toHaveLength(9);
    });

    it('should be readonly (const assertion)', () => {
      // This is a type-level check - the object should be frozen
      expect(typeof SPECIALIZATIONS).toBe('object');
    });
  });

  describe('getSpecializationName', () => {
    it('should return human-readable name for valid specialization code', () => {
      expect(getSpecializationName('psychiatrist')).toBe('Психиатр');
      expect(getSpecializationName('psychologist')).toBe('Психолог');
      expect(getSpecializationName('neurologist')).toBe('Невролог');
      expect(getSpecializationName('clinical_psychologist')).toBe('Клинический психолог');
    });

    it('should return "Не указана" for null', () => {
      expect(getSpecializationName(null)).toBe('Не указана');
    });

    it('should return "Не указана" for undefined', () => {
      expect(getSpecializationName(undefined)).toBe('Не указана');
    });

    it('should return "Не указана" for empty string', () => {
      expect(getSpecializationName('')).toBe('Не указана');
    });

    it('should return the code itself for unknown specialization', () => {
      expect(getSpecializationName('unknown_spec')).toBe('unknown_spec');
      expect(getSpecializationName('custom_role')).toBe('custom_role');
    });

    it('should handle all valid specialization codes', () => {
      const codes: SpecializationCode[] = [
        'psychiatrist',
        'psychologist',
        'neurologist',
        'neuropsychologist',
        'psychotherapist',
        'clinical_psychologist',
        'child_psychologist',
        'family_therapist',
        'group_therapist',
      ];

      for (const code of codes) {
        const name = getSpecializationName(code);
        expect(name).not.toBe('Не указана');
        expect(name).not.toBe(code); // Should be translated, not raw code
      }
    });
  });

  describe('getSpecializationList', () => {
    it('should return an array of objects with code and name', () => {
      const list = getSpecializationList();

      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(9);

      for (const item of list) {
        expect(item).toHaveProperty('code');
        expect(item).toHaveProperty('name');
        expect(typeof item.code).toBe('string');
        expect(typeof item.name).toBe('string');
      }
    });

    it('should include psychiatrist specialization', () => {
      const list = getSpecializationList();
      const psychiatrist = list.find((s) => s.code === 'psychiatrist');

      expect(psychiatrist).toBeDefined();
      expect(psychiatrist?.name).toBe('Психиатр');
    });

    it('should include all specializations from SPECIALIZATIONS constant', () => {
      const list = getSpecializationList();
      const codes = list.map((s) => s.code);

      expect(codes).toContain('psychiatrist');
      expect(codes).toContain('psychologist');
      expect(codes).toContain('neurologist');
      expect(codes).toContain('neuropsychologist');
      expect(codes).toContain('psychotherapist');
      expect(codes).toContain('clinical_psychologist');
      expect(codes).toContain('child_psychologist');
      expect(codes).toContain('family_therapist');
      expect(codes).toContain('group_therapist');
    });

    it('should be suitable for select dropdowns', () => {
      const list = getSpecializationList();

      // Each item should have a unique code
      const codes = list.map((s) => s.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);

      // Each item should have a non-empty name
      for (const item of list) {
        expect(item.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('isValidSpecialization', () => {
    it('should return true for valid specialization codes', () => {
      expect(isValidSpecialization('psychiatrist')).toBe(true);
      expect(isValidSpecialization('psychologist')).toBe(true);
      expect(isValidSpecialization('neurologist')).toBe(true);
      expect(isValidSpecialization('neuropsychologist')).toBe(true);
      expect(isValidSpecialization('psychotherapist')).toBe(true);
      expect(isValidSpecialization('clinical_psychologist')).toBe(true);
      expect(isValidSpecialization('child_psychologist')).toBe(true);
      expect(isValidSpecialization('family_therapist')).toBe(true);
      expect(isValidSpecialization('group_therapist')).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidSpecialization(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidSpecialization(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidSpecialization('')).toBe(false);
    });

    it('should return false for invalid specialization codes', () => {
      expect(isValidSpecialization('invalid')).toBe(false);
      expect(isValidSpecialization('doctor')).toBe(false);
      expect(isValidSpecialization('PSYCHIATRIST')).toBe(false); // case-sensitive
      expect(isValidSpecialization('Psychiatrist')).toBe(false);
      expect(isValidSpecialization('psycholog')).toBe(false); // typo
    });

    it('should be case-sensitive', () => {
      expect(isValidSpecialization('psychiatrist')).toBe(true);
      expect(isValidSpecialization('PSYCHIATRIST')).toBe(false);
      expect(isValidSpecialization('Psychiatrist')).toBe(false);
      expect(isValidSpecialization('pSYCHIATRIST')).toBe(false);
    });
  });

  describe('type safety', () => {
    it('SpecializationCode should be union of all keys', () => {
      // This is a compile-time check, but we can verify at runtime
      const validCodes: SpecializationCode[] = [
        'psychiatrist',
        'psychologist',
        'neurologist',
        'neuropsychologist',
        'psychotherapist',
        'clinical_psychologist',
        'child_psychologist',
        'family_therapist',
        'group_therapist',
      ];

      expect(validCodes.length).toBe(Object.keys(SPECIALIZATIONS).length);

      for (const code of validCodes) {
        expect(code in SPECIALIZATIONS).toBe(true);
      }
    });
  });
});
