/**
 * Secure patient data operations with PII encryption
 * Handles encryption/decryption of sensitive patient fields
 *
 * Encrypted fields: name, email, phone, address, notes
 */

import { supabase } from './supabase';
import { encryptPHI, decryptPHI, decryptPHIBatch, isEncryptionConfigured, isEncryptionConfiguredAsync } from './encryption';
import { format } from 'date-fns';
import type { Database } from '@/types/database.types';

type Patient = Database['public']['Tables']['patients']['Row'];
type PatientInsert = Database['public']['Tables']['patients']['Insert'];
type PatientUpdate = Database['public']['Tables']['patients']['Update'];

// HIPAA: Only log PHI-related debug info in development
const isDev = import.meta.env.DEV;

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
 * SECURITY: Fails if encryption is not configured or fails - NO plaintext fallback
 */
async function encryptPatientPII(
  data: Partial<PatientInsert>
): Promise<Partial<PatientInsert> & { [key: string]: unknown }> {
  // SECURITY: Check encryption configuration before proceeding
  const encryptionReady = await isEncryptionConfiguredAsync();
  if (!encryptionReady) {
    throw new Error('SECURITY: Encryption not configured. Cannot store PHI data without encryption.');
  }

  // Validate name first before processing
  if (data.name !== undefined) {
    const trimmedName = typeof data.name === 'string' ? data.name.trim() : '';
    if (!trimmedName) {
      throw new Error('Name field cannot be empty');
    }
  }

  // Start with a clean object - only include fields that are being updated
  const encrypted: Partial<PatientInsert> & { [key: string]: unknown } = {};

  // Copy non-PII fields as-is
  for (const key in data) {
    if (!PII_FIELDS.includes(key as PIIField)) {
      encrypted[key] = data[key as keyof typeof data];
    }
  }

  // Process PII fields
  for (const field of PII_FIELDS) {
    const value = data[field as keyof typeof data];
    // Only process if field is provided (not undefined)
    if (value !== undefined) {
      // Only encrypt non-empty strings
      if (value && typeof value === 'string' && value.trim().length > 0) {
        // SECURITY: No try/catch - if encryption fails, operation should fail
        const encryptedValue = await encryptPHI(value);
        // Convert base64 string to hex format for BYTEA column
        // Supabase expects BYTEA as hex string with \x prefix for direct insert
        // For RPC functions, we'll convert back to base64
        try {
          const binaryString = atob(encryptedValue);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          // Convert to hex string with \x prefix for PostgreSQL BYTEA
          const hexString = Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          encrypted[`${field}_encrypted`] = `\\x${hexString}`;
          // Also store base64 for RPC functions (will be extracted separately)
          encrypted[`${field}_encrypted_base64`] = encryptedValue;
        } catch (error) {
          console.error(`[encryptPatientPII] Failed to convert base64 to hex for ${field}:`, error);
          throw new Error(`Failed to prepare encrypted data for storage: ${error instanceof Error ? error.message : String(error)}`);
        }
        encrypted.pii_encryption_version = 1;
        // SECURITY: Do NOT store plaintext PII fields in database
        // For name field: do NOT include in update - Supabase will keep existing value
        // The encrypted version (name_encrypted) is the source of truth
        // When reading, decryptPatientPII will decrypt name_encrypted and populate name field
        // This ensures we never store plaintext PII while satisfying NOT NULL constraint
        // Note: This means name field in DB may contain old/legacy data, but it's ignored in favor of name_encrypted
        // For other PII fields, don't include plaintext - we only store encrypted version
      } else if (typeof value === 'string' && value.trim().length === 0) {
        // Empty string - for name field, this should be caught by validation above
        // For other optional fields, convert to null instead of empty string
        if (field === 'name') {
          // This should never happen due to validation above, but double-check
          throw new Error('Name field cannot be empty');
        }
        // For optional fields, set to null instead of empty string
        encrypted[field] = null;
        // Remove encrypted version if clearing the field
        delete encrypted[`${field}_encrypted`];
      }
    }
    // If value is undefined, don't include it in update (Supabase will leave existing value unchanged)
  }

  // Keep both hex and base64 versions
  // Hex versions are for direct insert/update (Supabase converts \x... to BYTEA)
  // Base64 versions are for RPC functions (which convert base64 to BYTEA using decode())
  // We don't remove base64 versions here - they're needed for createPatient RPC call
  // For updatePatient, we'll use hex versions directly

  return encrypted;
}

/**
 * Decrypt PII fields from storage
 * SECURITY: Fails if encryption is configured but decryption fails - NO silent failures
 */
async function decryptPatientPII(patient: Patient): Promise<DecryptedPatient> {
  const decrypted: DecryptedPatient = {
    ...patient,
    _isDecrypted: false,
  };

  // Check if patient has encrypted data
  const hasEncryptedData = (patient as Record<string, unknown>).pii_encryption_version;

  if (!hasEncryptedData) {
    // Patient data is in plaintext (legacy pre-encryption data)
    // Log warning for monitoring - this patient needs migration
    console.warn(`Patient ${patient.id} has unencrypted PII data - needs migration`);
    decrypted._isDecrypted = false;
    return decrypted;
  }

  // SECURITY: If data is encrypted, decryption MUST succeed
  // Собираем все зашифрованные значения для batch расшифровки
  const encryptedValues: Array<{ field: PIIField; value: string }> = [];
  
  for (const field of PII_FIELDS) {
    const encryptedField = `${field}_encrypted`;
    const encryptedValue = (patient as Record<string, unknown>)[encryptedField];

    if (encryptedValue) {
      const valueType = typeof encryptedValue;
      const valueStr = String(encryptedValue);
      if (isDev) console.log(`[decryptPatientPII] Found encrypted ${field}, type: ${valueType}, length: ${valueStr.length}`);
      
      let valueToDecrypt: string;
      
      if (typeof encryptedValue === 'string') {
        // Supabase returns BYTEA as hex string with \x prefix
        if (valueStr.startsWith('\\x')) {
          // Convert hex string to base64
          const hexString = valueStr.substring(2); // Remove \x prefix
          const bytes = new Uint8Array(hexString.length / 2);
          for (let i = 0; i < hexString.length; i += 2) {
            bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
          }
          // Use chunked conversion to avoid stack overflow on large arrays
          let binaryStr = '';
          for (let j = 0; j < bytes.length; j++) {
            binaryStr += String.fromCharCode(bytes[j]);
          }
          valueToDecrypt = btoa(binaryStr);
          if (isDev) console.log(`[decryptPatientPII] Converted hex BYTEA to base64 for ${field}, length: ${valueToDecrypt.length}`);
        } else {
          // Already base64 or plain string
          valueToDecrypt = encryptedValue;
        }
        encryptedValues.push({ field, value: valueToDecrypt });
      } else if (encryptedValue instanceof ArrayBuffer || encryptedValue instanceof Uint8Array) {
        // BYTEA returned as binary - convert to base64
        const bytes = encryptedValue instanceof ArrayBuffer ? new Uint8Array(encryptedValue) : encryptedValue;
        let binaryStr = '';
        for (let j = 0; j < bytes.length; j++) {
          binaryStr += String.fromCharCode(bytes[j]);
        }
        valueToDecrypt = btoa(binaryStr);
        if (isDev) console.log(`[decryptPatientPII] Converted BYTEA to base64 for ${field}, length: ${valueToDecrypt.length}`);
        encryptedValues.push({ field, value: valueToDecrypt });
      } else {
        console.warn(`[decryptPatientPII] Unexpected type for encrypted ${field}: ${valueType}`);
        continue;
      }
    } else {
      if (isDev) console.log(`[decryptPatientPII] No encrypted ${field} found`);
    }
  }

  // Выполняем batch расшифровку
  if (encryptedValues.length > 0) {
    try {
      const valuesToDecrypt = encryptedValues.map(v => v.value);
      if (isDev) console.log('[decryptPatientPII] Sending to decryptPHIBatch:', {
        count: valuesToDecrypt.length,
        firstValueType: typeof valuesToDecrypt[0],
        firstValueLength: valuesToDecrypt[0]?.length || 0,
      });
      const decryptedValues = await decryptPHIBatch(valuesToDecrypt);
      
      if (isDev) console.log(`[decryptPatientPII] Decrypted ${decryptedValues.length} values`);

      // Применяем расшифрованные значения
      encryptedValues.forEach((item, index) => {
        const decryptedValue = decryptedValues[index];
        (decrypted as Record<string, unknown>)[item.field] = decryptedValue;
      });
      
      decrypted._isDecrypted = true;
    } catch (err) {
      // SECURITY: If decryption fails, operation should fail
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[decryptPatientPII] Decryption failed:`, err);
      throw new Error(`Failed to decrypt patient PII data: ${errorMsg}`);
    }
  } else {
    console.warn(`[decryptPatientPII] No encrypted values found for patient ${patient.id}`);
  }

  return decrypted;
}

/**
 * Create a new patient with HIPAA-compliant encryption
 * SECURITY: All PII data is encrypted before storage
 */
export async function createPatient(
  data: PatientInsert
): Promise<{ data: DecryptedPatient | null; error: Error | null }> {
  try {
    // Validate required data
    if (!data.clinic_id) {
      console.error('createPatient: clinic_id is required');
      return { data: null, error: new Error('Клиника не указана. Пожалуйста, войдите снова.') };
    }

    if (!data.name || !data.name.trim()) {
      console.error('createPatient: name is required');
      return { data: null, error: new Error('Имя пациента обязательно.') };
    }

    if (isDev) console.log('createPatient: Creating patient with encryption, clinic_id:', data.clinic_id);

    // HIPAA COMPLIANCE: Encrypt all PII data before storage
    // Note: encryptPatientPII returns both hex (for direct insert) and base64 (for RPC) versions
    const encryptedData = await encryptPatientPII(data);

    // Extract base64 versions before they're removed (for RPC function)
    const base64Data: Record<string, string | null> = {};
    const encryptedDataWithBase64 = encryptedData as Record<string, string | number | null | undefined>;
    for (const field of PII_FIELDS) {
      const base64Field = `${field}_encrypted_base64`;
      const base64Value = encryptedDataWithBase64[base64Field];
      base64Data[field] = typeof base64Value === 'string' ? base64Value : null;
      if (isDev) console.log(`[createPatient] Extracted base64 for ${field}:`, base64Data[field] ? `present (length: ${base64Data[field]?.length || 0})` : 'null');
    }

    // SECURITY: Use placeholder for name field to satisfy NOT NULL constraint
    // The encrypted version (name_encrypted) is the ONLY source of truth
    if (!('name' in encryptedData)) {
      encryptedData.name = '[ENCRYPTED]';
      if (isDev) console.log('createPatient: Using placeholder for NOT NULL constraint');
    }

    const rpcParams = {
      p_clinic_id: data.clinic_id,
      p_name: encryptedData.name || '[ENCRYPTED]', // Placeholder for NOT NULL
      p_created_by: data.created_by || null,
      p_email: encryptedData.email || null, // Legacy/placeholder
      p_phone: encryptedData.phone || null, // Legacy/placeholder
      p_date_of_birth: data.date_of_birth || null,
      p_gender: data.gender || null,
      p_address: encryptedData.address || null, // Legacy/placeholder
      p_notes: encryptedData.notes || null, // Legacy/placeholder
      p_tags: data.tags || [],
      // Encrypted PII fields (source of truth) - pass as base64 strings
      // RPC function will convert them to BYTEA using decode()
      p_name_encrypted: base64Data.name || null,
      p_email_encrypted: base64Data.email || null,
      p_phone_encrypted: base64Data.phone || null,
      p_address_encrypted: base64Data.address || null,
      p_notes_encrypted: base64Data.notes || null,
      p_pii_encryption_version: encryptedData.pii_encryption_version || null,
    };

    if (isDev) console.log('[createPatient] RPC params:', {
      hasNameEncrypted: !!rpcParams.p_name_encrypted,
      hasEmailEncrypted: !!rpcParams.p_email_encrypted,
      hasPhoneEncrypted: !!rpcParams.p_phone_encrypted,
      piiVersion: rpcParams.p_pii_encryption_version,
    });

    // Use RPC function to bypass RLS while maintaining HIPAA compliance
    // RPC function accepts encrypted data and creates assignment automatically
    const { data: patientId, error: rpcError } = await supabase.rpc('create_patient_secure', rpcParams);

    if (rpcError) {
      console.error('createPatient: RPC error:', rpcError);
      return { data: null, error: new Error(rpcError.message || 'Не удалось создать пациента') };
    }

    if (!patientId) {
      return { data: null, error: new Error('Не удалось создать пациента') };
    }

    if (isDev) console.log('createPatient: Patient created with id:', patientId);

    // Fetch the created patient to return decrypted data
    const { data: patient, error: fetchError } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single();

    if (fetchError || !patient) {
      console.error('createPatient: Failed to fetch created patient:', fetchError);
      // Return minimal data if fetch fails
      return {
        data: {
          id: patientId,
          clinic_id: data.clinic_id,
          name: data.name, // Return original name (will be decrypted on next fetch)
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
          notes: data.notes || null,
          _isDecrypted: false,
        } as DecryptedPatient,
        error: null,
      };
    }

    // Decrypt patient data for return
    const decryptedPatient = await decryptPatientPII(patient);
    return { data: decryptedPatient, error: null };
  } catch (error) {
    console.error('createPatient: Unexpected error:', error);
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
      .is('deleted_at', null);

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const decryptedPatients = await Promise.all(
      patients.map((p) => decryptPatientPII(p))
    );

    // Сортировка по актуальности: last_activity_at > updated_at > created_at
    const sortedPatients = decryptedPatients.sort((a, b) => {
      const getDate = (p: DecryptedPatient) => {
        return p.last_activity_at 
          ? new Date(p.last_activity_at).getTime()
          : p.updated_at
          ? new Date(p.updated_at).getTime()
          : new Date(p.created_at).getTime();
      };
      
      return getDate(b) - getDate(a); // Более актуальные сверху
    });

    return { data: sortedPatients, error: null };
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
    // Validate that name is not empty if provided
    if (data.name !== undefined) {
      const trimmedName = typeof data.name === 'string' ? data.name.trim() : '';
      if (!trimmedName) {
        console.error('[updatePatient] Attempted to update patient with empty name, id:', id);
        return { 
          data: null, 
          error: new Error('Имя пациента не может быть пустым') 
        };
      }
      // Ensure we use trimmed name
      data.name = trimmedName;
    }

    if (isDev) console.log('[updatePatient] Updating patient:', { id, hasName: data.name !== undefined, dataKeys: Object.keys(data) });

    // SECURITY: Always get current patient to preserve existing name value in DB
    // This is needed to satisfy NOT NULL constraint, even though we only use name_encrypted as source of truth
    // We preserve the existing plaintext name (legacy data) to avoid database constraint violations
    const { data: currentPatient } = await supabase
      .from('patients')
      .select('name')
      .eq('id', id)
      .single();
    
    const existingName = currentPatient?.name || null;

    const encryptedData = await encryptPatientPII(data);

    // Remove base64 versions for update (we use hex versions for direct insert)
    for (const field of PII_FIELDS) {
      const base64Field = `${field}_encrypted_base64`;
      if (base64Field in encryptedData) {
        delete encryptedData[base64Field as keyof typeof encryptedData];
      }
    }

    if (isDev) console.log('[updatePatient] After encryption:', {
      id,
      hasName: 'name' in encryptedData,
      hasNameEncrypted: 'name_encrypted' in encryptedData,
    });

    // Double-check that name_encrypted is present after encryption if name was provided
    if (data.name !== undefined && !encryptedData.name_encrypted) {
      console.error('[updatePatient] Name encryption failed - name_encrypted missing for patient:', id);
      return {
        data: null,
        error: new Error('Ошибка при обработке имени пациента')
      };
    }

    // SECURITY: For NOT NULL constraint, we MUST provide a value for name field
    // HIPAA COMPLIANCE: We NEVER store plaintext PHI data in the database
    // We use a constant placeholder to satisfy NOT NULL constraint
    // The encrypted version (name_encrypted) is the ONLY source of truth
    // When reading, decryptPatientPII will decrypt name_encrypted and populate name field
    // This ensures full HIPAA compliance: no plaintext PHI is ever stored
    if (!('name' in encryptedData)) {
      // Use constant placeholder - never store real plaintext name
      encryptedData.name = '[ENCRYPTED]';
      if (isDev) console.log('[updatePatient] Using placeholder for NOT NULL constraint');
    }

    if (isDev) console.log('[updatePatient] Final encryptedData before update:', {
      id,
      hasName: 'name' in encryptedData,
      hasNameEncrypted: 'name_encrypted' in encryptedData,
    });

    const { data: patient, error } = await supabase
      .from('patients')
      .update(encryptedData as PatientUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[updatePatient] Database error:', error);
      return { data: null, error: new Error(error.message) };
    }

    if (isDev) console.log('[updatePatient] Patient updated (before decryption):', {
      id: patient.id,
      hasNameEncrypted: 'name_encrypted' in patient,
      piiVersion: patient.pii_encryption_version,
    });

    const decryptedPatient = await decryptPatientPII(patient);
    if (isDev) console.log('[updatePatient] Patient updated successfully:', { id, isDecrypted: decryptedPatient._isDecrypted });
    return { data: decryptedPatient, error: null };
  } catch (error) {
    console.error('[updatePatient] Unexpected error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Soft delete a patient
 * Uses RPC function to bypass RLS circular dependency (consent needed to see patient,
 * but patient needed to delete)
 */
export async function deletePatient(
  id: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    if (isDev) console.log('[deletePatient] Soft deleting patient:', id);
    
    const { data, error } = await supabase.rpc('soft_delete_patient', {
      p_patient_id: id,
    });

    if (error) {
      console.error('[deletePatient] Error soft deleting patient via RPC:', error);
      return { success: false, error: new Error(error.message) };
    }

    if (isDev) console.log('[deletePatient] Patient soft deleted successfully');
    return { success: true, error: null };
  } catch (error) {
    console.error('[deletePatient] Unexpected error:', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Search patients by all fields (searches encrypted data)
 * Note: For encrypted data, search is done client-side after decryption
 * Searches in: name, email, phone, address, notes, tags, date_of_birth, gender
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

    // If query is empty, return all patients
    if (!query || query.trim() === '') {
      return { data: patients, error: null };
    }

    // Filter by all patient fields
    const normalizedQuery = query.toLowerCase().trim();
    const filtered = patients.filter((p) => {
      const name = p.name?.toLowerCase() || '';
      const email = p.email?.toLowerCase() || '';
      const phone = p.phone?.toLowerCase() || '';
      const address = p.address?.toLowerCase() || '';
      const notes = p.notes?.toLowerCase() || '';
      const gender = p.gender?.toLowerCase() || '';
      const dateOfBirth = p.date_of_birth 
        ? format(new Date(p.date_of_birth), 'dd.MM.yyyy') 
        : '';
      const tags = (p.tags || []).join(' ').toLowerCase();

      return (
        name.includes(normalizedQuery) ||
        email.includes(normalizedQuery) ||
        phone.includes(normalizedQuery) ||
        address.includes(normalizedQuery) ||
        notes.includes(normalizedQuery) ||
        gender.includes(normalizedQuery) ||
        dateOfBirth.includes(normalizedQuery) ||
        tags.includes(normalizedQuery) ||
        p.id.toLowerCase().includes(normalizedQuery)
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
        const encryptedBase64 = await encryptPHI(value);
        // Convert base64 to hex format for BYTEA column (same as encryptPatientPII)
        const binaryString = atob(encryptedBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const hexString = Array.from(bytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        updateData[`${field}_encrypted`] = `\\x${hexString}`;
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

/**
 * Get document count for a patient
 */
export async function getPatientDocumentCount(
  patientId: string
): Promise<{ count: number; error: Error | null }> {
  try {
    const { count, error } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', patientId);

    if (error) {
      return { count: 0, error: new Error(error.message) };
    }

    return { count: count || 0, error: null };
  } catch (error) {
    return { count: 0, error: error as Error };
  }
}

/**
 * Get document counts for multiple patients
 */
export async function getPatientDocumentCounts(
  patientIds: string[]
): Promise<{ [patientId: string]: number }> {
  if (patientIds.length === 0) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('patient_id')
      .in('patient_id', patientIds);

    if (error) {
      console.error('Error fetching document counts:', error);
      return {};
    }

    // Count documents per patient
    const counts: { [patientId: string]: number } = {};
    patientIds.forEach((id) => {
      counts[id] = 0;
    });

    data?.forEach((doc) => {
      if (doc.patient_id) {
        counts[doc.patient_id] = (counts[doc.patient_id] || 0) + 1;
      }
    });

    return counts;
  } catch (error) {
    console.error('Error in getPatientDocumentCounts:', error);
    return {};
  }
}

// Re-export encryption utilities for convenience
export { isEncryptionConfigured } from './encryption';
