-- PsiPilot Assistant - Patient Assignments System
-- Migration: 037_patient_assignments
-- Description: Create patient assignments table and migrate existing data

-- ============================================
-- CREATE PATIENT ASSIGNMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS patient_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    
    -- Type of assignment
    assignment_type VARCHAR(50) DEFAULT 'primary' 
        CHECK (assignment_type IN ('primary', 'consultant', 'group_therapist')),
    
    -- Metadata
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    
    -- Ensure one doctor cannot be assigned twice to the same patient
    UNIQUE(patient_id, doctor_id)
    -- Note: Проверка принадлежности к одной клинике выполняется в функциях назначения,
    -- так как CHECK constraint не поддерживает подзапросы в PostgreSQL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_patient_assignments_patient_id ON patient_assignments(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_assignments_doctor_id ON patient_assignments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patient_assignments_clinic_id ON patient_assignments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_assignments_assignment_type ON patient_assignments(assignment_type);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_patient_assignments_doctor_patient 
ON patient_assignments(doctor_id, patient_id);

-- Add updated_at trigger
CREATE TRIGGER update_patient_assignments_updated_at 
    BEFORE UPDATE ON patient_assignments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE patient_assignments IS 
'Назначения врачей пациентам. Каждый пациент может быть назначен нескольким врачам. Админ управляет назначениями.';

COMMENT ON COLUMN patient_assignments.assignment_type IS 
'Тип назначения: primary (основной врач), consultant (консультант), group_therapist (групповой терапевт)';

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Automatically create assignments for all existing patients
-- Assign created_by as primary doctor
INSERT INTO patient_assignments (patient_id, doctor_id, clinic_id, assignment_type, assigned_at)
SELECT 
    p.id,
    COALESCE(p.created_by, (SELECT id FROM profiles WHERE clinic_id = p.clinic_id AND role IN ('specialist', 'admin') ORDER BY created_at LIMIT 1)),
    p.clinic_id,
    'primary',
    p.created_at
FROM patients p
WHERE p.deleted_at IS NULL
  AND p.created_by IS NOT NULL
  AND EXISTS (
      SELECT 1 FROM profiles pr 
      WHERE pr.id = p.created_by 
      AND pr.clinic_id = p.clinic_id
  )
ON CONFLICT (patient_id, doctor_id) DO NOTHING;

-- For patients without created_by - assign first specialist/admin of clinic
INSERT INTO patient_assignments (patient_id, doctor_id, clinic_id, assignment_type, assigned_at)
SELECT 
    p.id,
    (SELECT id FROM profiles 
     WHERE clinic_id = p.clinic_id 
     AND role IN ('specialist', 'admin') 
     ORDER BY created_at LIMIT 1),
    p.clinic_id,
    'primary',
    p.created_at
FROM patients p
WHERE p.deleted_at IS NULL
  AND p.created_by IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM patient_assignments pa WHERE pa.patient_id = p.id
  )
  AND EXISTS (
      SELECT 1 FROM profiles pr 
      WHERE pr.clinic_id = p.clinic_id 
      AND pr.role IN ('specialist', 'admin')
  )
ON CONFLICT (patient_id, doctor_id) DO NOTHING;

-- ============================================
-- FUNCTIONS FOR MANAGING ASSIGNMENTS
-- ============================================

-- Function to assign patient to doctor (admin only)
CREATE OR REPLACE FUNCTION assign_patient_to_doctor(
    p_patient_id UUID,
    p_doctor_id UUID,
    p_assignment_type VARCHAR(50) DEFAULT 'primary',
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_clinic_id UUID;
    v_patient_clinic_id UUID;
    v_doctor_clinic_id UUID;
    v_assignment_id UUID;
BEGIN
    -- Check: only admin can assign
    IF NOT is_user_admin() THEN
        RAISE EXCEPTION 'Only administrators can assign patients';
    END IF;
    
    v_user_id := auth.uid();
    v_user_clinic_id := get_user_clinic_id();
    
    IF v_user_clinic_id IS NULL THEN
        RAISE EXCEPTION 'User must belong to a clinic';
    END IF;
    
    -- Check: patient exists and in the same clinic
    SELECT clinic_id INTO v_patient_clinic_id
    FROM patients
    WHERE id = p_patient_id AND deleted_at IS NULL;
    
    IF v_patient_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Patient not found';
    END IF;
    
    IF v_patient_clinic_id != v_user_clinic_id THEN
        RAISE EXCEPTION 'Patient belongs to different clinic';
    END IF;
    
    -- Check: doctor exists and in the same clinic
    SELECT clinic_id INTO v_doctor_clinic_id
    FROM profiles
    WHERE id = p_doctor_id;
    
    IF v_doctor_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Doctor not found';
    END IF;
    
    IF v_doctor_clinic_id != v_user_clinic_id THEN
        RAISE EXCEPTION 'Doctor belongs to different clinic';
    END IF;
    
    -- Create or update assignment
    INSERT INTO patient_assignments (
        patient_id,
        doctor_id,
        clinic_id,
        assignment_type,
        assigned_by,
        notes
    )
    VALUES (
        p_patient_id,
        p_doctor_id,
        v_user_clinic_id,
        p_assignment_type,
        v_user_id,
        p_notes
    )
    ON CONFLICT (patient_id, doctor_id) 
    DO UPDATE SET
        assignment_type = EXCLUDED.assignment_type,
        assigned_by = EXCLUDED.assigned_by,
        notes = EXCLUDED.notes,
        assigned_at = NOW()
    RETURNING id INTO v_assignment_id;
    
    -- Logging
    PERFORM log_audit_event(
        'assign',
        'patient_data',
        'patient_assignment',
        p_patient_id,
        NULL,
        jsonb_build_object('doctor_id', p_doctor_id, 'type', p_assignment_type),
        NULL,
        true,
        ARRAY['admin']
    );
    
    RETURN v_assignment_id;
END;
$$;

COMMENT ON FUNCTION assign_patient_to_doctor IS 
'Назначает пациента врачу. Только администратор может использовать эту функцию.';

-- Function to unassign patient from doctor (admin only)
CREATE OR REPLACE FUNCTION unassign_patient_from_doctor(
    p_patient_id UUID,
    p_doctor_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_user_clinic_id UUID;
    v_deleted_count INTEGER;
BEGIN
    -- Check: only admin
    IF NOT is_user_admin() THEN
        RAISE EXCEPTION 'Only administrators can unassign patients';
    END IF;
    
    v_user_id := auth.uid();
    v_user_clinic_id := get_user_clinic_id();
    
    IF v_user_clinic_id IS NULL THEN
        RAISE EXCEPTION 'User must belong to a clinic';
    END IF;
    
    -- Check: assignment exists and in the same clinic
    DELETE FROM patient_assignments
    WHERE patient_id = p_patient_id
      AND doctor_id = p_doctor_id
      AND clinic_id = v_user_clinic_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    IF v_deleted_count = 0 THEN
        RAISE EXCEPTION 'Assignment not found';
    END IF;
    
    -- Logging
    PERFORM log_audit_event(
        'unassign',
        'patient_data',
        'patient_assignment',
        p_patient_id,
        NULL,
        jsonb_build_object('doctor_id', p_doctor_id),
        NULL,
        true,
        ARRAY['admin']
    );
    
    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION unassign_patient_from_doctor IS 
'Отвязывает пациента от врача. Только администратор может использовать эту функцию.';

-- Function to reassign patient (unassign + assign)
CREATE OR REPLACE FUNCTION reassign_patient(
    p_patient_id UUID,
    p_old_doctor_id UUID,
    p_new_doctor_id UUID,
    p_assignment_type VARCHAR(50) DEFAULT 'primary'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assignment_id UUID;
BEGIN
    -- Unassign old doctor
    PERFORM unassign_patient_from_doctor(p_patient_id, p_old_doctor_id);
    
    -- Assign new doctor
    SELECT assign_patient_to_doctor(
        p_patient_id,
        p_new_doctor_id,
        p_assignment_type
    ) INTO v_assignment_id;
    
    RETURN v_assignment_id;
END;
$$;

COMMENT ON FUNCTION reassign_patient IS 
'Переназначает пациента: отвязывает от старого врача и привязывает к новому. Только администратор.';

-- Function to check if user can access patient
CREATE OR REPLACE FUNCTION user_can_access_patient(p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_user_id UUID;
    v_user_clinic_id UUID;
    v_is_admin BOOLEAN;
    v_has_assignment BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    v_user_clinic_id := get_user_clinic_id();
    v_is_admin := is_user_admin();
    
    -- Admin sees all patients in clinic
    IF v_is_admin THEN
        RETURN EXISTS (
            SELECT 1 FROM patients
            WHERE id = p_patient_id
              AND clinic_id = v_user_clinic_id
              AND deleted_at IS NULL
        );
    END IF;
    
    -- Specialist sees only assigned patients
    SELECT EXISTS (
        SELECT 1 FROM patient_assignments
        WHERE patient_id = p_patient_id
          AND doctor_id = v_user_id
          AND clinic_id = v_user_clinic_id
    ) INTO v_has_assignment;
    
    RETURN v_has_assignment;
END;
$$;

COMMENT ON FUNCTION user_can_access_patient IS 
'Проверяет, может ли текущий пользователь получить доступ к пациенту. Админ видит всех, специалист - только назначенных.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION assign_patient_to_doctor TO authenticated;
GRANT EXECUTE ON FUNCTION unassign_patient_from_doctor TO authenticated;
GRANT EXECUTE ON FUNCTION reassign_patient TO authenticated;
GRANT EXECUTE ON FUNCTION user_can_access_patient TO authenticated;

