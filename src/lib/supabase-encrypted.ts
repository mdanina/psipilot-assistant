/**
 * Encrypted Supabase client wrapper
 * Automatically encrypts/decrypts PHI fields on insert/update/select
 */

import { supabase } from './supabase';
import { encryptPHI, decryptPHI } from './encryption';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// PHI fields that need encryption
const PHI_FIELDS = {
  clinical_notes: ['ai_summary'],
  sections: ['ai_content'],
  sessions: ['transcript'],
  recordings: ['transcription_text'],
} as const;

type TableName = keyof typeof PHI_FIELDS;
type PhiField<T extends TableName> = typeof PHI_FIELDS[T][number];

/**
 * Encrypt PHI fields in data object
 */
async function encryptPhiFields<T extends TableName>(
  table: T,
  data: Record<string, any>
): Promise<Record<string, any>> {
  const fields = PHI_FIELDS[table];
  if (!fields) {
    return data;
  }

  const encrypted = { ...data };

  for (const field of fields) {
    if (data[field] && typeof data[field] === 'string') {
      try {
        encrypted[`${field}_encrypted`] = await encryptPHI(data[field]);
        // Remove plaintext field (optional - keep for migration period)
        // delete encrypted[field];
      } catch (error) {
        console.error(`Failed to encrypt ${field}:`, error);
        throw error;
      }
    }
  }

  return encrypted;
}

/**
 * Decrypt PHI fields in data object
 */
async function decryptPhiFields<T extends TableName>(
  table: T,
  data: Record<string, any>
): Promise<Record<string, any>> {
  const fields = PHI_FIELDS[table];
  if (!fields) {
    return data;
  }

  const decrypted = { ...data };

  for (const field of fields) {
    const encryptedField = `${field}_encrypted`;
    if (data[encryptedField]) {
      try {
        decrypted[field] = await decryptPHI(data[encryptedField]);
      } catch (error) {
        console.error(`Failed to decrypt ${field}:`, error);
        // Keep encrypted value if decryption fails
        decrypted[field] = null;
      }
    }
  }

  return decrypted;
}

/**
 * Create encrypted Supabase client wrapper
 */
export function createEncryptedClient(): SupabaseClient<Database> {
  const client = supabase;

  // Wrap the from() method to handle encryption/decryption
  const originalFrom = client.from.bind(client);

  // Create a proxy to intercept method calls
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'from') {
        return (table: string) => {
          const query = originalFrom(table);

          // Wrap select to decrypt
          const originalSelect = query.select.bind(query);
          query.select = async (columns?: string) => {
            const result = await originalSelect(columns);
            
            if (result.data && Array.isArray(result.data)) {
              // Decrypt each row
              const decryptedData = await Promise.all(
                result.data.map((row: any) => 
                  decryptPhiFields(table as TableName, row)
                )
              );
              return { ...result, data: decryptedData };
            } else if (result.data) {
              // Single object
              const decryptedData = await decryptPhiFields(table as TableName, result.data);
              return { ...result, data: decryptedData };
            }
            
            return result;
          };

          // Wrap insert to encrypt
          const originalInsert = query.insert.bind(query);
          query.insert = async (values: any) => {
            if (Array.isArray(values)) {
              const encryptedValues = await Promise.all(
                values.map((row) => encryptPhiFields(table as TableName, row))
              );
              return originalInsert(encryptedValues);
            } else {
              const encryptedValues = await encryptPhiFields(table as TableName, values);
              return originalInsert(encryptedValues);
            }
          };

          // Wrap update to encrypt
          const originalUpdate = query.update.bind(query);
          query.update = async (values: any) => {
            const encryptedValues = await encryptPhiFields(table as TableName, values);
            return originalUpdate(encryptedValues);
          };

          return query;
        };
      }

      return target[prop as keyof typeof target];
    },
  }) as SupabaseClient<Database>;
}

/**
 * Default encrypted client instance
 */
export const encryptedSupabase = createEncryptedClient();



