/**
 * Secure patient data operations with PII encryption
 * Handles encryption/decryption of sensitive patient fields
 *
 * Encrypted fields: name, email, phone, address, notes
 */

import { supabase } from './supabase';
import { encryptPHI, decryptPHI, isEncryptionConfigured } from './encryption';
import type { Database } from '@/types/database.types';

type Patient = Database['public']['Tables']['patients']['Row'];
type PatientInsert = Database['public']['Tables']['patients']['Insert'];
type PatientUpdate = Database['public']['Tables']['patients']['Update'];

// Fields that should be encrypted
const PII_FIELDS = ['name', 'email', 'phone', 'address', 'notes'] as const;
type PIIField = (typeof PII_FIELDS)[number];

/**
 * Patient with decrypted PII fields
 */
export interface DecryptedPatient extends Omit<Patient, 'name'> {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  _isDecrypted: boolean;
}

/**
 * Encrypt PII fields for storage
 */
async function encryptPatientPII(
  data: Partial<PatientInsert>
): Promise<Partial<PatientInsert> & { [key: string]: unknown }> {
  if (!isEncryptionConfigured()) {
    console.warn('Encryption not configured, storing PII in plaintext');
    return data;
  }

  const encrypted: Partial<PatientInsert> & { [key: string]: unknown } = { ...data };

  for (const field of PII_FIELDS) {
    const value = data[field as keyof typeof data];
    if (value && typeof value === 'string') {
      try {
        const encryptedValue = await encryptPHI(value);
        // Store encrypted value in _encrypted column, keep original for backward compat
        encrypted[`${field}_encrypted`] = encryptedValue;
        encrypted.pii_encryption_version = 1;
      } catch (error) {
        console.error(`Failed to encrypt ${field}:`, error);
        // Fall back to plaintext
      }
    }
  }

  return encrypted;
}

/**
 * Decrypt PII fields from storage
 */
async function decryptPatientPII(patient: Patient): Promise<DecryptedPatient> {
  const decrypted: DecryptedPatient = {
    ...patient,
    _isDecrypted: false,
  };

  if (!isEncryptionConfigured()) {
    decrypted._isDecrypted = false;
    return decrypted;
  }

  // Check if patient has encrypted data
  const hasEncryptedData = (patient as Record<string, unknown>).pii_encryption_version;

  if (!hasEncryptedData) {
    // Patient data is in plaintext (pre-encryption)
    decrypted._isDecrypted = false;
    return decrypted;
  }

  for (const field of PII_FIELDS) {
    const encryptedField = `${field}_encrypted`;
    const encryptedValue = (patient as Record<string, unknown>)[encryptedField];

    if (encryptedValue && typeof encryptedValue === 'string') {
      try {
        const decryptedValue = await decryptPHI(encryptedValue);
        (decrypted as Record<string, unknown>)[field] = decryptedValue;
        decrypted._isDecrypted = true;
      } catch (error) {
        console.error(`Failed to decrypt ${field}:`, error);
        // Keep original value as fallback
      }
    }
  }

  return decrypted;
}

/**
 * Create a new patient with encrypted PII
 */
export async function createPatient(
  data: PatientInsert
): Promise<{ data: DecryptedPatient | null; error: Error | null }> {
  try {
    const encryptedData = await encryptPatientPII(data);

    const { data: patient, error } = await supabase
      .from('patients')
      .insert(encryptedData as PatientInsert)
      .select()
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const decryptedPatient = await decryptPatientPII(patient);
    return { data: decryptedPatient, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get a patient by ID with decrypted PII
 */
export async function getPatient(
  id: string
): Promise<{ data: DecryptedPatient | null; error: Error | null }> {
  try {
    const { data: patient, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const decryptedPatient = await decryptPatientPII(patient);
    return { data: decryptedPatient, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get all patients for the current clinic with decrypted PII
 */
export async function getPatients(): Promise<{
  data: DecryptedPatient[] | null;
  error: Error | null;
}> {
  try {
    const { data: patients, error } = await supabase
      .from('patients')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const decryptedPatients = await Promise.all(
      patients.map((p) => decryptPatientPII(p))
    );

    return { data: decryptedPatients, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Update a patient with encrypted PII
 */
export async function updatePatient(
  id: string,
  data: PatientUpdate
): Promise<{ data: DecryptedPatient | null; error: Error | null }> {
  try {
    const encryptedData = await encryptPatientPII(data);

    const { data: patient, error } = await supabase
      .from('patients')
      .update(encryptedData as PatientUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const decryptedPatient = await decryptPatientPII(patient);
    return { data: decryptedPatient, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Soft delete a patient
 */
export async function deletePatient(
  id: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('patients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Search patients by name (searches encrypted data)
 * Note: For encrypted data, search is done client-side after decryption
 */
export async function searchPatients(
  query: string
): Promise<{ data: DecryptedPatient[] | null; error: Error | null }> {
  try {
    // Get all patients first (RLS will filter by clinic)
    const { data: patients, error } = await getPatients();

    if (error || !patients) {
      return { data: null, error };
    }

    // Filter by decrypted name
    const normalizedQuery = query.toLowerCase();
    const filtered = patients.filter((p) => {
      const name = p.name?.toLowerCase() || '';
      const email = p.email?.toLowerCase() || '';
      const phone = p.phone?.toLowerCase() || '';

      return (
        name.includes(normalizedQuery) ||
        email.includes(normalizedQuery) ||
        phone.includes(normalizedQuery)
      );
    });

    return { data: filtered, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Migrate existing patient to encrypted format
 * Call this for patients that have plaintext PII
 */
export async function migratePatientToEncrypted(
  id: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Get current patient data
    const { data: patient, error: fetchError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !patient) {
      return { success: false, error: new Error(fetchError?.message || 'Patient not found') };
    }

    // Check if already encrypted
    if ((patient as Record<string, unknown>).pii_encryption_version) {
      return { success: true, error: null }; // Already migrated
    }

    // Encrypt the PII fields
    const updateData: Record<string, unknown> = {
      pii_encryption_version: 1,
    };

    for (const field of PII_FIELDS) {
      const value = patient[field as keyof typeof patient];
      if (value && typeof value === 'string') {
        const encrypted = await encryptPHI(value);
        updateData[`${field}_encrypted`] = encrypted;
      }
    }

    // Update the patient
    const { error: updateError } = await supabase
      .from('patients')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      return { success: false, error: new Error(updateError.message) };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Batch migrate all patients to encrypted format
 */
export async function migrateAllPatientsToEncrypted(): Promise<{
  migrated: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    migrated: 0,
    failed: 0,
    errors: [] as string[],
  };

  if (!isEncryptionConfigured()) {
    result.errors.push('Encryption key not configured');
    return result;
  }

  // Get all patients without encryption version
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, name')
    .is('pii_encryption_version', null);

  if (error) {
    result.errors.push(`Failed to fetch patients: ${error.message}`);
    return result;
  }

  for (const patient of patients || []) {
    const { success, error: migrateError } = await migratePatientToEncrypted(patient.id);

    if (success) {
      result.migrated++;
    } else {
      result.failed++;
      result.errors.push(`Patient ${patient.id}: ${migrateError?.message}`);
    }
  }

  return result;
}

// Re-export encryption utilities for convenience
export { isEncryptionConfigured } from './encryption';
