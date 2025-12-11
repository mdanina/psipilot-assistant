/**
 * Audit logging for local recording storage operations
 * Integrates with existing audit_logs system
 */

import { supabase } from './supabase';

/**
 * Log local storage operation to audit_logs
 * Uses the existing log_read_access function pattern
 */
export async function logLocalStorageOperation(
  action: 'local_storage_save' | 'local_storage_read' | 'local_storage_delete' | 'local_storage_upload_success' | 'local_storage_upload_failed',
  recordingId: string | null,
  details?: {
    fileName?: string;
    error?: string;
    duration?: number;
  }
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

    if (!profile) {
      console.warn('Profile not found for audit logging');
      return;
    }

    // Map action to audit log action type
    const auditAction = action === 'local_storage_save' ? 'create' :
                        action === 'local_storage_read' ? 'read' :
                        action === 'local_storage_delete' ? 'delete' :
                        action === 'local_storage_upload_success' ? 'update' :
                        'update'; // upload_failed is also update

    // Determine if PHI was accessed
    const phiAccessed = true; // Audio recordings contain PHI
    const phiFields = ['audio_recording']; // Audio recordings are PHI

    // Create audit log entry
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: user.id,
        user_email: user.email,
        user_role: profile.role,
        clinic_id: profile.clinic_id,
        action: auditAction,
        action_category: 'recording',
        resource_type: 'recording',
        resource_id: recordingId,
        resource_name: details?.fileName || 'Local Recording',
        phi_accessed: phiAccessed,
        phi_fields: phiFields,
        success: action !== 'local_storage_upload_failed',
        error_message: action === 'local_storage_upload_failed' ? details?.error : null,
        // Store additional details in new_values JSONB
        new_values: details ? {
          action: action,
          fileName: details.fileName,
          duration: details.duration,
          error: details.error,
        } : null,
      });

    if (error) {
      console.error('Failed to log local storage operation:', error);
      // Don't throw - audit logging failure shouldn't break the app
    }
  } catch (error) {
    console.error('Error in local storage audit logging:', error);
    // Silently fail - audit logging shouldn't break functionality
  }
}

