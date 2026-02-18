import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PatientCombobox } from '../patient-combobox';

const patients = [
  {
    id: 'patient-1',
    clinic_id: 'clinic-1',
    created_by: 'user-1',
    name: 'Мария Михайловна Данина',
    email: 'maria@example.com',
    phone: null,
    date_of_birth: null,
    gender: null,
    address: null,
    notes: null,
    tags: [],
    last_activity_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
  },
  {
    id: 'patient-2',
    clinic_id: 'clinic-1',
    created_by: 'user-1',
    name: 'Мария Михайловна Данина',
    email: 'maria.2@example.com',
    phone: null,
    date_of_birth: null,
    gender: null,
    address: null,
    notes: null,
    tags: [],
    last_activity_at: null,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    deleted_at: null,
  },
];

describe('PatientCombobox', () => {
  beforeEach(() => {
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  it('renders placeholder when value is not selected', () => {
    const onValueChange = vi.fn();
    render(
      <PatientCombobox
        patients={patients}
        value=""
        onValueChange={onValueChange}
        placeholder="Выберите пациента"
      />
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Выберите пациента');
  });

  it('renders selected patient name and subtitle', () => {
    const onValueChange = vi.fn();
    render(
      <PatientCombobox
        patients={patients}
        value="patient-1"
        onValueChange={onValueChange}
      />
    );

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveTextContent('Мария Михайловна Данина');
    expect(combobox).toHaveTextContent('maria@example.com');
  });

  it('allows selecting duplicate names as separate patients by id', () => {
    const onValueChange = vi.fn();
    render(
      <PatientCombobox
        patients={patients}
        value=""
        onValueChange={onValueChange}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const duplicateOptions = screen.getAllByText('Мария Михайловна Данина');
    expect(duplicateOptions.length).toBeGreaterThan(1);

    fireEvent.click(duplicateOptions[1]);
    expect(onValueChange).toHaveBeenCalledWith('patient-2');
  });

  it('is disabled when disabled prop is true', () => {
    const onValueChange = vi.fn();
    render(
      <PatientCombobox
        patients={patients}
        value=""
        onValueChange={onValueChange}
        disabled
      />
    );

    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
