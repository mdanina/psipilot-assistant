/**
 * Patient assignments management functions
 * Handles assigning/unassigning patients to doctors (admin only)
 */

import { supabase } from './supabase';
import type { Database } from '@/types/database.types';

type PatientAssignment = Database['public']['Tables']['patient_assignments']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export interface PatientAssignmentWithDoctor extends PatientAssignment {
  doctor: Profile;
}

export type AssignmentType = 'primary' | 'consultant' | 'group_therapist';

/**
 * Assign patient to doctor (admin only)
 */
export async function assignPatientToDoctor(
  patientId: string,
  doctorId: string,
  assignmentType: AssignmentType = 'primary',
  notes?: string
) {
  const { data, error } = await supabase.rpc('assign_patient_to_doctor', {
    p_patient_id: patientId,
    p_doctor_id: doctorId,
    p_assignment_type: assignmentType,
    p_notes: notes || null,
  });

  if (error) {
    console.error('Error assigning patient to doctor:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}

/**
 * Unassign patient from doctor (admin only)
 */
export async function unassignPatientFromDoctor(
  patientId: string,
  doctorId: string
) {
  const { data, error } = await supabase.rpc('unassign_patient_from_doctor', {
    p_patient_id: patientId,
    p_doctor_id: doctorId,
  });

  if (error) {
    console.error('Error unassigning patient from doctor:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}

/**
 * Reassign patient (unassign from old doctor, assign to new doctor) (admin only)
 */
export async function reassignPatient(
  patientId: string,
  oldDoctorId: string,
  newDoctorId: string,
  assignmentType: AssignmentType = 'primary'
) {
  const { data, error } = await supabase.rpc('reassign_patient', {
    p_patient_id: patientId,
    p_old_doctor_id: oldDoctorId,
    p_new_doctor_id: newDoctorId,
    p_assignment_type: assignmentType,
  });

  if (error) {
    console.error('Error reassigning patient:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}

/**
 * Get all doctors assigned to a patient
 */
export async function getPatientAssignments(
  patientId: string
): Promise<{ data: PatientAssignmentWithDoctor[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('patient_assignments')
    .select(`
      *,
      doctor:profiles!patient_assignments_doctor_id_fkey(*)
    `)
    .eq('patient_id', patientId)
    .order('assigned_at', { ascending: false });

  if (error) {
    console.error('Error getting patient assignments:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as PatientAssignmentWithDoctor[], error: null };
}

/**
 * Get all patients assigned to current doctor
 * (automatically filtered by RLS)
 */
export async function getAssignedPatients() {
  // RLS automatically filters to show only assigned patients
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .is('deleted_at', null)
    .order('last_activity_at', { ascending: false });

  if (error) {
    console.error('Error getting assigned patients:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}

/**
 * Get all clinic patients (admin only)
 * (automatically filtered by RLS - admin sees all)
 */
export async function getAllClinicPatients() {
  // RLS automatically shows all patients for admin
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .is('deleted_at', null)
    .order('last_activity_at', { ascending: false });

  if (error) {
    console.error('Error getting all clinic patients:', error);
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}

