/**
 * Security utilities for PsiPilot Assistant
 * Includes IP blocking, backup codes, and retention management
 */

import { supabase } from './supabase';

// ============================================
// IP BLOCKING
// ============================================

export interface IPBlockCheck {
  blocked: boolean;
  reason?: string;
  action?: 'deny' | 'block' | 'account_locked';
  expires_at?: string;
  retry_after?: string;
  attempts_remaining?: number;
}

/**
 * Check if an IP address should be blocked and handle auto-blocking
 */
export async function checkIPBlock(
  email: string,
  ipAddress: string
): Promise<{ data: IPBlockCheck | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('check_and_block_suspicious_ip', {
      check_email: email,
      check_ip: ipAddress,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as IPBlockCheck, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Check if an IP is on the blocklist
 */
export async function isIPBlocked(
  ipAddress: string
): Promise<{ blocked: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('is_ip_blocked', {
      check_ip: ipAddress,
    });

    if (error) {
      return { blocked: false, error: new Error(error.message) };
    }

    return { blocked: data as boolean, error: null };
  } catch (error) {
    return { blocked: false, error: error as Error };
  }
}

/**
 * Block an IP address (admin only)
 */
export async function blockIP(
  ipAddress: string,
  reason: string,
  duration?: string // PostgreSQL interval, e.g., '1 hour', '1 day', null for permanent
): Promise<{ id: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('block_ip', {
      target_ip: ipAddress,
      block_reason: reason,
      duration: duration || null,
    });

    if (error) {
      return { id: null, error: new Error(error.message) };
    }

    return { id: data as string, error: null };
  } catch (error) {
    return { id: null, error: error as Error };
  }
}

/**
 * Unblock an IP address (admin only)
 */
export async function unblockIP(
  ipAddress: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('unblock_ip', {
      target_ip: ipAddress,
    });

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: data as boolean, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Get the IP blocklist (admin only)
 */
export async function getIPBlocklist(): Promise<{
  data: Array<{
    id: string;
    ip_address: string;
    reason: string;
    blocked_at: string;
    expires_at: string | null;
    is_active: boolean;
  }> | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('ip_blocklist')
      .select('*')
      .eq('is_active', true)
      .order('blocked_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

// ============================================
// BACKUP CODES
// ============================================

/**
 * Generate new backup codes for the current user
 * Returns plaintext codes (only shown once)
 */
export async function generateBackupCodes(
  codeCount: number = 10
): Promise<{ codes: string[] | null; error: Error | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { codes: null, error: new Error('Not authenticated') };
    }

    const { data, error } = await supabase.rpc('generate_backup_codes', {
      user_uuid: user.id,
      code_count: codeCount,
    });

    if (error) {
      return { codes: null, error: new Error(error.message) };
    }

    return { codes: data as string[], error: null };
  } catch (error) {
    return { codes: null, error: error as Error };
  }
}

/**
 * Verify a backup code
 * Code is consumed on successful verification (one-time use)
 */
export async function verifyBackupCode(
  code: string
): Promise<{ valid: boolean; error: Error | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { valid: false, error: new Error('Not authenticated') };
    }

    const { data, error } = await supabase.rpc('verify_backup_code', {
      user_uuid: user.id,
      code: code.toUpperCase().replace(/\s/g, ''),
    });

    if (error) {
      return { valid: false, error: new Error(error.message) };
    }

    return { valid: data as boolean, error: null };
  } catch (error) {
    return { valid: false, error: error as Error };
  }
}

/**
 * Get remaining backup codes count
 */
export async function getRemainingBackupCodesCount(): Promise<{
  count: number;
  error: Error | null;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { count: 0, error: new Error('Not authenticated') };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('backup_codes_hashed')
      .eq('id', user.id)
      .single();

    if (error) {
      return { count: 0, error: new Error(error.message) };
    }

    const codes = data?.backup_codes_hashed;
    return { count: Array.isArray(codes) ? codes.length : 0, error: null };
  } catch (error) {
    return { count: 0, error: error as Error };
  }
}

// ============================================
// RETENTION MANAGEMENT
// ============================================

export interface RetentionStatus {
  category: string;
  total_count: number;
  expired_count: number;
  retention_period: string;
}

export interface CleanupResult {
  table_name: string;
  deleted_count: number;
}

/**
 * Get current retention status for all data categories
 */
export async function getRetentionStatus(): Promise<{
  data: RetentionStatus[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc('get_retention_status');

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as RetentionStatus[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Run retention cleanup (removes expired data)
 * Should be called by a scheduled job
 */
export async function runRetentionCleanup(): Promise<{
  data: CleanupResult[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_data');

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as CleanupResult[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

// ============================================
// FAILED LOGIN TRACKING
// ============================================

/**
 * Record a failed login attempt
 */
export async function recordFailedLogin(
  email: string,
  ipAddress: string,
  failureReason: 'invalid_password' | 'user_not_found' | 'account_locked' | 'mfa_failed'
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase.from('failed_login_attempts').insert({
      email,
      ip_address: ipAddress,
      failure_reason: failureReason,
      user_agent: navigator.userAgent,
    });

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// ============================================
// CONSENT MANAGEMENT HELPERS
// ============================================

export type ConsentType =
  | 'data_processing'
  | 'recording'
  | 'ai_analysis'
  | 'data_sharing'
  | 'marketing';

export interface ConsentRecord {
  id: string;
  patient_id: string;
  consent_type: ConsentType;
  consent_purpose: string;
  legal_basis: string;
  status: 'active' | 'withdrawn' | 'expired';
  given_at: string;
  expires_at: string | null;
  withdrawn_at: string | null;
}

/**
 * Create a consent record for a patient
 */
export async function createConsent(
  patientId: string,
  consentType: ConsentType,
  purpose: string,
  legalBasis: string = 'consent',
  consentMethod: 'written' | 'electronic' | 'verbal_recorded' = 'electronic'
): Promise<{ data: ConsentRecord | null; error: Error | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('consent_records')
      .insert({
        patient_id: patientId,
        consent_type: consentType,
        consent_purpose: purpose,
        legal_basis: legalBasis,
        status: 'active',
        consent_method: consentMethod,
        collected_by: user?.id,
        data_categories: ['personal', 'health'],
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as ConsentRecord, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Withdraw a consent
 */
export async function withdrawConsent(
  consentId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('consent_records')
      .update({
        status: 'withdrawn',
        withdrawn_at: new Date().toISOString(),
      })
      .eq('id', consentId);

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Get all consent records for a patient
 */
export async function getPatientConsents(
  patientId: string
): Promise<{ data: ConsentRecord[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('consent_records')
      .select('*')
      .eq('patient_id', patientId)
      .order('given_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as ConsentRecord[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Check if patient has active consent of a specific type
 */
export async function hasActiveConsent(
  patientId: string,
  consentType: ConsentType
): Promise<{ hasConsent: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('has_active_consent', {
      patient_uuid: patientId,
      consent_type_param: consentType,
    });

    if (error) {
      return { hasConsent: false, error: new Error(error.message) };
    }

    return { hasConsent: data as boolean, error: null };
  } catch (error) {
    return { hasConsent: false, error: error as Error };
  }
}
