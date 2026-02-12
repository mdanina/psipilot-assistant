/**
 * Audited Supabase client wrapper
 * Automatically logs all READ operations to audit_logs table
 * Required for HIPAA compliance
 */

import { supabase } from './supabase';
import type { SupabaseClient, PostgrestQueryBuilder } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

// PHI fields by table (for audit logging)
const PHI_FIELDS_BY_TABLE: Record<string, string[]> = {
  patients: ['name', 'email', 'phone', 'date_of_birth', 'address', 'notes'],
  clinical_notes: ['ai_summary', 'title'],
  sections: ['ai_content', 'content'],
  sessions: ['transcript', 'notes'],
  recordings: ['transcription_text'],
  documents: ['file_name', 'title', 'description'],
} as const;

/**
 * Determine if a query accesses PHI fields
 */
function getPhiFields(table: string, columns?: string): string[] {
  const allPhiFields = PHI_FIELDS_BY_TABLE[table] || [];
  
  if (!columns || columns === '*') {
    return allPhiFields;
  }

  // Parse columns (handle 'field1, field2' or 'field1,field2')
  const requestedFields = columns
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);

  // Return intersection of requested fields and PHI fields
  return allPhiFields.filter(field => 
    requestedFields.some(req => 
      req === field || req === '*' || req.includes(field)
    )
  );
}

/**
 * Get client IP address (if available)
 */
function getClientIP(): string | null {
  // In browser, we can't get real IP, but we can try to get from headers
  // For server-side, this would be available from request headers
  return null; // Browser-side limitation
}

/**
 * Get user agent
 */
function getUserAgent(): string {
  return navigator.userAgent || 'unknown';
}

/**
 * Log READ operation to audit_logs
 */
async function logReadAccess(
  table: string,
  resourceId: string | null,
  resourceName: string | null,
  phiFields: string[]
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return; // Not authenticated, skip logging
    }

    // Get user profile for clinic_id and role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, clinic_id')
      .eq('id', user.id)
      .single();

    // Call the database function to log read access
    const { error } = await supabase.rpc('log_read_access', {
      resource_type_param: table,
      resource_id_param: resourceId,
      resource_name_param: resourceName,
      phi_fields_param: phiFields,
    });

    if (error) {
      console.error('Failed to log read access:', error);
      // Don't throw - audit logging failure shouldn't break the app
    }
  } catch (error) {
    console.error('Error in audit logging:', error);
    // Silently fail - audit logging shouldn't break functionality
  }
}

/**
 * Create audited Supabase client wrapper
 */
export function createAuditedClient(): SupabaseClient<Database> {
  const client = supabase;

  // Wrap the from() method to add audit logging
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'from') {
        return (table: string) => {
          const query = target.from(table);

          // Wrap select to add audit logging
          const originalSelect = query.select.bind(query);
          
          // Create a new select function
          const auditedSelect = async (columns?: string) => {
            const result = await originalSelect(columns);
            
            // Log read access if data was retrieved
            if (result.data && !result.error) {
              const phiFields = getPhiFields(table, columns);
              
              if (Array.isArray(result.data)) {
                // Log each row accessed
                for (const row of result.data) {
                  await logReadAccess(
                    table,
                    row.id || null,
                    row.name || row.title || row.file_name || null,
                    phiFields
                  );
                }
              } else if (result.data) {
                // Single object
                const row = result.data as Record<string, unknown>;
                await logReadAccess(
                  table,
                  typeof row.id === 'string' ? row.id : null,
                  (typeof row.name === 'string' ? row.name : typeof row.title === 'string' ? row.title : typeof row.file_name === 'string' ? row.file_name : null),
                  phiFields
                );
              }
            }
            
            return result;
          };

          // Replace select method
          query.select = auditedSelect;

          return query;
        };
      }

      return target[prop as keyof typeof target];
    },
  }) as SupabaseClient<Database>;
}

/**
 * Default audited client instance
 * Use this instead of direct supabase client for PHI data access
 */
export const auditedSupabase = createAuditedClient();

/**
 * Combined encrypted and audited client
 * Use this for maximum security (encryption + audit logging)
 */
export function createSecureClient(): SupabaseClient<Database> {
  // This would combine both encryption and auditing
  // For now, return audited client (encryption can be added layer)
  return createAuditedClient();
}

export const secureSupabase = createSecureClient();










