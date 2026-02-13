import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkIPBlock,
  isIPBlocked,
  blockIP,
  unblockIP,
  getIPBlocklist,
  generateBackupCodes,
  verifyBackupCode,
  getRemainingBackupCodesCount,
  getRetentionStatus,
  runRetentionCleanup,
  recordFailedLogin,
  createConsent,
  withdrawConsent,
  getPatientConsents,
  hasActiveConsent,
  type IPBlockCheck,
  type ConsentType,
} from '../security';
import { supabase } from '../supabase';

// Mock supabase
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('IP Blocking', () => {
    describe('checkIPBlock', () => {
      it('should check if IP should be blocked', async () => {
        const mockResult: IPBlockCheck = {
          blocked: false,
          reason: undefined,
        };

        vi.mocked(supabase.rpc).mockResolvedValue({
          data: mockResult,
          error: null,
        });

        const { data, error } = await checkIPBlock('test@example.com', '192.168.1.1');

        expect(supabase.rpc).toHaveBeenCalledWith('check_and_block_suspicious_ip', {
          check_email: 'test@example.com',
          check_ip: '192.168.1.1',
        });
        expect(data).toEqual(mockResult);
        expect(error).toBeNull();
      });

      it('should return blocked status when IP is suspicious', async () => {
        const mockResult: IPBlockCheck = {
          blocked: true,
          reason: 'Too many failed attempts',
          action: 'block',
          retry_after: '30 minutes',
        };

        vi.mocked(supabase.rpc).mockResolvedValue({
          data: mockResult,
          error: null,
        });

        const { data, error } = await checkIPBlock('attacker@example.com', '10.0.0.1');

        expect(data?.blocked).toBe(true);
        expect(data?.reason).toBe('Too many failed attempts');
        expect(error).toBeNull();
      });

      it('should handle errors', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: null,
          error: { message: 'Database error', details: '', hint: '', code: '' },
        });

        const { data, error } = await checkIPBlock('test@example.com', '192.168.1.1');

        expect(data).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toBe('Database error');
      });
    });

    describe('isIPBlocked', () => {
      it('should return true when IP is blocked', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: true,
          error: null,
        });

        const { blocked, error } = await isIPBlocked('10.0.0.1');

        expect(supabase.rpc).toHaveBeenCalledWith('is_ip_blocked', {
          check_ip: '10.0.0.1',
        });
        expect(blocked).toBe(true);
        expect(error).toBeNull();
      });

      it('should return false when IP is not blocked', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: false,
          error: null,
        });

        const { blocked, error } = await isIPBlocked('192.168.1.1');

        expect(blocked).toBe(false);
        expect(error).toBeNull();
      });

      it('should handle errors gracefully', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: null,
          error: { message: 'RPC error', details: '', hint: '', code: '' },
        });

        const { blocked, error } = await isIPBlocked('192.168.1.1');

        expect(blocked).toBe(false);
        expect(error).toBeInstanceOf(Error);
      });
    });

    describe('blockIP', () => {
      it('should block an IP address', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: 'block-id-123',
          error: null,
        });

        const { id, error } = await blockIP('10.0.0.1', 'Suspicious activity', '1 day');

        expect(supabase.rpc).toHaveBeenCalledWith('block_ip', {
          target_ip: '10.0.0.1',
          block_reason: 'Suspicious activity',
          duration: '1 day',
        });
        expect(id).toBe('block-id-123');
        expect(error).toBeNull();
      });

      it('should block permanently when no duration specified', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: 'block-id-456',
          error: null,
        });

        const { id, error } = await blockIP('10.0.0.1', 'Permanent ban');

        expect(supabase.rpc).toHaveBeenCalledWith('block_ip', {
          target_ip: '10.0.0.1',
          block_reason: 'Permanent ban',
          duration: null,
        });
        expect(id).toBe('block-id-456');
        expect(error).toBeNull();
      });
    });

    describe('unblockIP', () => {
      it('should unblock an IP address', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: true,
          error: null,
        });

        const { success, error } = await unblockIP('10.0.0.1');

        expect(supabase.rpc).toHaveBeenCalledWith('unblock_ip', {
          target_ip: '10.0.0.1',
        });
        expect(success).toBe(true);
        expect(error).toBeNull();
      });
    });

    describe('getIPBlocklist', () => {
      it('should return list of blocked IPs', async () => {
        const mockBlocklist = [
          {
            id: '1',
            ip_address: '10.0.0.1',
            reason: 'Suspicious activity',
            blocked_at: '2024-01-01T00:00:00Z',
            expires_at: '2024-01-02T00:00:00Z',
            is_active: true,
          },
        ];

        vi.mocked(supabase.from).mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockBlocklist,
            error: null,
          }),
        } as never);

        const { data, error } = await getIPBlocklist();

        expect(data).toEqual(mockBlocklist);
        expect(error).toBeNull();
      });
    });
  });

  describe('Backup Codes', () => {
    describe('generateBackupCodes', () => {
      it('should generate backup codes for authenticated user', async () => {
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
              aud: 'authenticated',
              role: 'authenticated',
              created_at: '2024-01-01',
              app_metadata: {},
              user_metadata: {},
            },
          },
          error: null,
        });

        const mockCodes = ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5'];
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: mockCodes,
          error: null,
        });

        const { codes, error } = await generateBackupCodes(5);

        expect(supabase.rpc).toHaveBeenCalledWith('generate_backup_codes', {
          user_uuid: 'user-123',
          code_count: 5,
        });
        expect(codes).toEqual(mockCodes);
        expect(error).toBeNull();
      });

      it('should return error when not authenticated', async () => {
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
          data: { user: null },
          error: null,
        });

        const { codes, error } = await generateBackupCodes();

        expect(codes).toBeNull();
        expect(error?.message).toBe('Not authenticated');
      });

      it('should default to 10 codes', async () => {
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
          data: {
            user: { id: 'user-123', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', created_at: '', app_metadata: {}, user_metadata: {} },
          },
          error: null,
        });

        vi.mocked(supabase.rpc).mockResolvedValue({
          data: [],
          error: null,
        });

        await generateBackupCodes();

        expect(supabase.rpc).toHaveBeenCalledWith('generate_backup_codes', {
          user_uuid: 'user-123',
          code_count: 10,
        });
      });
    });

    describe('verifyBackupCode', () => {
      it('should verify a valid backup code', async () => {
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
          data: {
            user: { id: 'user-123', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', created_at: '', app_metadata: {}, user_metadata: {} },
          },
          error: null,
        });

        vi.mocked(supabase.rpc).mockResolvedValue({
          data: true,
          error: null,
        });

        const { valid, error } = await verifyBackupCode('ABC123');

        expect(supabase.rpc).toHaveBeenCalledWith('verify_backup_code', {
          user_uuid: 'user-123',
          code: 'ABC123',
        });
        expect(valid).toBe(true);
        expect(error).toBeNull();
      });

      it('should normalize code (uppercase, no spaces)', async () => {
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
          data: {
            user: { id: 'user-123', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', created_at: '', app_metadata: {}, user_metadata: {} },
          },
          error: null,
        });

        vi.mocked(supabase.rpc).mockResolvedValue({
          data: true,
          error: null,
        });

        await verifyBackupCode('abc 123');

        expect(supabase.rpc).toHaveBeenCalledWith('verify_backup_code', {
          user_uuid: 'user-123',
          code: 'ABC123',
        });
      });
    });

    describe('getRemainingBackupCodesCount', () => {
      it('should return count of remaining backup codes', async () => {
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
          data: {
            user: { id: 'user-123', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', created_at: '', app_metadata: {}, user_metadata: {} },
          },
          error: null,
        });

        vi.mocked(supabase.from).mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { backup_codes_hashed: ['h1', 'h2', 'h3'] },
            error: null,
          }),
        } as never);

        const { count, error } = await getRemainingBackupCodesCount();

        expect(count).toBe(3);
        expect(error).toBeNull();
      });

      it('should return 0 when no codes exist', async () => {
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
          data: {
            user: { id: 'user-123', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', created_at: '', app_metadata: {}, user_metadata: {} },
          },
          error: null,
        });

        vi.mocked(supabase.from).mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { backup_codes_hashed: null },
            error: null,
          }),
        } as never);

        const { count, error } = await getRemainingBackupCodesCount();

        expect(count).toBe(0);
        expect(error).toBeNull();
      });
    });
  });

  describe('Retention Management', () => {
    describe('getRetentionStatus', () => {
      it('should return retention status for all categories', async () => {
        const mockStatus = [
          { category: 'sessions', total_count: 100, expired_count: 10, retention_period: '1 year' },
          { category: 'recordings', total_count: 50, expired_count: 5, retention_period: '6 months' },
        ];

        vi.mocked(supabase.rpc).mockResolvedValue({
          data: mockStatus,
          error: null,
        });

        const { data, error } = await getRetentionStatus();

        expect(supabase.rpc).toHaveBeenCalledWith('get_retention_status');
        expect(data).toEqual(mockStatus);
        expect(error).toBeNull();
      });
    });

    describe('runRetentionCleanup', () => {
      it('should run cleanup and return results', async () => {
        const mockResults = [
          { table_name: 'sessions', deleted_count: 10 },
          { table_name: 'recordings', deleted_count: 5 },
        ];

        vi.mocked(supabase.rpc).mockResolvedValue({
          data: mockResults,
          error: null,
        });

        const { data, error } = await runRetentionCleanup();

        expect(supabase.rpc).toHaveBeenCalledWith('cleanup_expired_data');
        expect(data).toEqual(mockResults);
        expect(error).toBeNull();
      });
    });
  });

  describe('Failed Login Tracking', () => {
    describe('recordFailedLogin', () => {
      it('should record a failed login attempt', async () => {
        vi.mocked(supabase.from).mockReturnValue({
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        } as never);

        const { success, error } = await recordFailedLogin(
          'test@example.com',
          '192.168.1.1',
          'invalid_password'
        );

        expect(supabase.from).toHaveBeenCalledWith('failed_login_attempts');
        expect(success).toBe(true);
        expect(error).toBeNull();
      });

      it('should handle all failure reasons', async () => {
        vi.mocked(supabase.from).mockReturnValue({
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        } as never);

        const reasons: Array<'invalid_password' | 'user_not_found' | 'account_locked' | 'mfa_failed'> = [
          'invalid_password',
          'user_not_found',
          'account_locked',
          'mfa_failed',
        ];

        for (const reason of reasons) {
          const { success } = await recordFailedLogin('test@example.com', '192.168.1.1', reason);
          expect(success).toBe(true);
        }
      });
    });
  });

  describe('Consent Management', () => {
    describe('createConsent', () => {
      it('should create a consent record', async () => {
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
          data: {
            user: { id: 'user-123', email: 'test@example.com', aud: 'authenticated', role: 'authenticated', created_at: '', app_metadata: {}, user_metadata: {} },
          },
          error: null,
        });

        const mockConsent = {
          id: 'consent-123',
          patient_id: 'patient-123',
          consent_type: 'data_processing',
          consent_purpose: 'Treatment',
          legal_basis: 'consent',
          status: 'active',
          given_at: '2024-01-01T00:00:00Z',
          expires_at: null,
          withdrawn_at: null,
        };

        vi.mocked(supabase.from).mockReturnValue({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockConsent,
            error: null,
          }),
        } as never);

        const { data, error } = await createConsent(
          'patient-123',
          'data_processing' as ConsentType,
          'Treatment',
          'consent',
          'electronic'
        );

        expect(data).toEqual(mockConsent);
        expect(error).toBeNull();
      });
    });

    describe('withdrawConsent', () => {
      it('should withdraw a consent', async () => {
        vi.mocked(supabase.from).mockReturnValue({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        } as never);

        const { success, error } = await withdrawConsent('consent-123');

        expect(success).toBe(true);
        expect(error).toBeNull();
      });
    });

    describe('getPatientConsents', () => {
      it('should return all consents for a patient', async () => {
        const mockConsents = [
          { id: 'c1', consent_type: 'data_processing', status: 'active' },
          { id: 'c2', consent_type: 'recording', status: 'withdrawn' },
        ];

        vi.mocked(supabase.from).mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockConsents,
            error: null,
          }),
        } as never);

        const { data, error } = await getPatientConsents('patient-123');

        expect(data).toEqual(mockConsents);
        expect(error).toBeNull();
      });
    });

    describe('hasActiveConsent', () => {
      it('should check if patient has active consent', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: true,
          error: null,
        });

        const { hasConsent, error } = await hasActiveConsent('patient-123', 'data_processing');

        expect(supabase.rpc).toHaveBeenCalledWith('has_active_consent', {
          patient_uuid: 'patient-123',
          consent_type_param: 'data_processing',
        });
        expect(hasConsent).toBe(true);
        expect(error).toBeNull();
      });

      it('should return false when no active consent', async () => {
        vi.mocked(supabase.rpc).mockResolvedValue({
          data: false,
          error: null,
        });

        const { hasConsent, error } = await hasActiveConsent('patient-123', 'recording');

        expect(hasConsent).toBe(false);
        expect(error).toBeNull();
      });
    });
  });
});
