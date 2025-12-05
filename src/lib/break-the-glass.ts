/**
 * Break-the-Glass Emergency Access
 * Provides controlled emergency access to patient records when normal access is unavailable
 *
 * HIPAA Compliance: All emergency access is logged and must be reviewed
 */

import { supabase } from './supabase';

export type EmergencyType =
  | 'life_threatening' // Life-threatening emergency - immediate access
  | 'court_order' // Legal requirement - requires admin approval
  | 'patient_request' // Patient explicitly requested - requires admin approval
  | 'public_health' // Public health emergency - immediate access
  | 'other'; // Other documented reason - requires admin approval

export interface BreakTheGlassRequest {
  patientId: string;
  reason: string;
  emergencyType: EmergencyType;
  referenceNumber?: string; // Court order number, incident ID, etc.
  accessDuration?: string; // PostgreSQL interval, default '4 hours'
}

export interface BreakTheGlassLog {
  id: string;
  user_id: string;
  user_email: string;
  user_role: string;
  clinic_id: string;
  patient_id: string;
  patient_name: string;
  reason: string;
  emergency_type: EmergencyType;
  reference_number: string | null;
  access_granted_at: string;
  access_expires_at: string;
  access_revoked_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  is_approved: boolean | null;
  actions_taken: string[] | null;
}

/**
 * Request emergency access to a patient record
 *
 * @param request - The emergency access request details
 * @returns The BTG log ID if successful
 */
export async function requestEmergencyAccess(
  request: BreakTheGlassRequest
): Promise<{ data: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('request_emergency_access', {
      target_patient_id: request.patientId,
      emergency_reason: request.reason,
      emergency_type_param: request.emergencyType,
      reference_num: request.referenceNumber || null,
      access_duration: request.accessDuration || '4 hours',
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as string, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Check if current user has emergency access to a patient
 */
export async function hasEmergencyAccess(
  patientId: string
): Promise<{ hasAccess: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('has_emergency_access', {
      target_patient_id: patientId,
    });

    if (error) {
      return { hasAccess: false, error: new Error(error.message) };
    }

    return { hasAccess: data as boolean, error: null };
  } catch (error) {
    return { hasAccess: false, error: error as Error };
  }
}

/**
 * Log an action taken during emergency access
 */
export async function logEmergencyAction(
  btgId: string,
  actionDescription: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase.rpc('log_emergency_action', {
      btg_id: btgId,
      action_description: actionDescription,
    });

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

/**
 * Revoke emergency access (user can revoke their own, admin can revoke any)
 */
export async function revokeEmergencyAccess(
  btgId: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('revoke_emergency_access', {
      btg_id: btgId,
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
 * Review an emergency access request (admin only)
 */
export async function reviewEmergencyAccess(
  btgId: string,
  approved: boolean,
  notes?: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('review_emergency_access', {
      btg_id: btgId,
      approved,
      notes: notes || null,
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
 * Get all emergency access logs for the current user
 */
export async function getMyEmergencyAccessLogs(): Promise<{
  data: BreakTheGlassLog[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('break_the_glass_log')
      .select('*')
      .order('access_granted_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as BreakTheGlassLog[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get pending emergency access requests for admin review
 */
export async function getPendingEmergencyAccessRequests(): Promise<{
  data: BreakTheGlassLog[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('break_the_glass_log')
      .select('*')
      .is('is_approved', null)
      .gt('access_expires_at', new Date().toISOString())
      .order('access_granted_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as BreakTheGlassLog[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get active emergency access sessions
 */
export async function getActiveEmergencyAccessSessions(): Promise<{
  data: BreakTheGlassLog[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('break_the_glass_log')
      .select('*')
      .is('access_revoked_at', null)
      .gt('access_expires_at', new Date().toISOString())
      .order('access_granted_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as BreakTheGlassLog[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Emergency access types with descriptions
 */
export const EMERGENCY_TYPES: Record<EmergencyType, { label: string; description: string; immediateAccess: boolean }> = {
  life_threatening: {
    label: 'Угроза жизни',
    description: 'Экстренная ситуация, угрожающая жизни или здоровью пациента',
    immediateAccess: true,
  },
  court_order: {
    label: 'Судебное решение',
    description: 'Доступ по решению суда или запросу правоохранительных органов',
    immediateAccess: false,
  },
  patient_request: {
    label: 'Запрос пациента',
    description: 'Пациент явно запросил предоставление данных другому врачу',
    immediateAccess: false,
  },
  public_health: {
    label: 'Общественное здравоохранение',
    description: 'Чрезвычайная ситуация в области общественного здравоохранения',
    immediateAccess: true,
  },
  other: {
    label: 'Другое',
    description: 'Другая задокументированная причина для экстренного доступа',
    immediateAccess: false,
  },
};
