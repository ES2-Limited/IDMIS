import { describe, it, expect } from 'vitest';
import {
  AccessTokenPayloadSchema,
  AuthMeResponseSchema,
  SignInInputSchema,
  SignInResponseSchema,
  TotpSetupInputSchema,
  TotpSetupResponseSchema,
  TotpVerifyInputSchema,
  ChangePasswordInputSchema,
  ChangePasswordResponseSchema,
  AdminResetPasswordInputSchema,
  AdminResetPasswordResponseSchema,
  RefreshTokenInputSchema,
  RefreshTokenResponseSchema,
  SignOutResponseSchema,
} from './auth';

describe('auth contracts', () => {
  describe('AccessTokenPayloadSchema (Strict Identity Only)', () => {
    it('accepts valid minimal token payload with sub, sid, iat, exp', () => {
      const payload = {
        sub: '018f3a5e-0000-7000-8000-000000000001',
        sid: '018f3a5e-0000-7000-8000-000000000002',
        iat: 1700000000,
        exp: 1700000900,
      };

      const parsed = AccessTokenPayloadSchema.parse(payload);
      expect(parsed.sub).toBe('018f3a5e-0000-7000-8000-000000000001');
      expect(parsed.sid).toBe('018f3a5e-0000-7000-8000-000000000002');
    });

    it('strictly rejects extra claims (roles, email, isSystemAdmin, etc.)', () => {
      const payloadWithExtras = {
        sub: '018f3a5e-0000-7000-8000-000000000001',
        sid: '018f3a5e-0000-7000-8000-000000000002',
        email: 'admin@triming.gov.ng',
        roles: ['system_admin'],
        isSystemAdmin: true,
      };

      expect(() => AccessTokenPayloadSchema.parse(payloadWithExtras)).toThrow();
    });

    it('rejects non-uuid sub or sid', () => {
      expect(() =>
        AccessTokenPayloadSchema.parse({
          sub: 'not-a-uuid',
          sid: '018f3a5e-0000-7000-8000-000000000002',
        }),
      ).toThrow();

      expect(() =>
        AccessTokenPayloadSchema.parse({
          sub: '018f3a5e-0000-7000-8000-000000000001',
          sid: 'not-a-uuid',
        }),
      ).toThrow();
    });
  });

  describe('SignInResponseSchema (Discriminated Union on status)', () => {
    const mockUser = {
      id: '018f3a5e-0000-7000-8000-000000000001',
      email: 'admin@triming.gov.ng',
      fullName: 'System Admin',
      phone: null,
      mustChangePassword: false,
      isSystemAdmin: true,
      totpEnabled: true,
      roles: ['system_admin'],
      createdAt: '2026-10-21T00:00:00.000Z',
    };

    it('parses authenticated status', () => {
      const parsedUser = AuthMeResponseSchema.parse(mockUser);
      expect(parsedUser.id).toBe('018f3a5e-0000-7000-8000-000000000001');

      const response = {
        status: 'authenticated',
        accessToken: 'jwt-access-token',
        expiresIn: 900,
        user: parsedUser,
      };

      const parsed = SignInResponseSchema.parse(response);
      expect(parsed.status).toBe('authenticated');
      if (parsed.status === 'authenticated') {
        expect(parsed.accessToken).toBe('jwt-access-token');
        expect(parsed.user.email).toBe('admin@triming.gov.ng');
      }
    });

    it('validates SignInInputSchema', () => {
      const input = SignInInputSchema.parse({
        email: 'user@triming.gov.ng',
        password: 'ValidPassword123!',
        installationId: '018f3a5e-0000-7000-8000-000000000001',
        deviceLabel: 'Pixel 8',
        platform: 'Android 14',
      });
      expect(input.email).toBe('user@triming.gov.ng');
      expect(input.installationId).toBe('018f3a5e-0000-7000-8000-000000000001');
    });

    it('parses totp_required status', () => {
      const response = {
        status: 'totp_required',
        tempToken: 'totp-temp-token-xyz',
      };

      const parsed = SignInResponseSchema.parse(response);
      expect(parsed.status).toBe('totp_required');
      if (parsed.status === 'totp_required') {
        expect(parsed.tempToken).toBe('totp-temp-token-xyz');
      }
    });

    it('parses totp_setup_required status', () => {
      const response = {
        status: 'totp_setup_required',
        tempToken: 'totp-setup-temp-token',
      };

      const parsed = SignInResponseSchema.parse(response);
      expect(parsed.status).toBe('totp_setup_required');
      if (parsed.status === 'totp_setup_required') {
        expect(parsed.tempToken).toBe('totp-setup-temp-token');
      }
    });

    it('parses password_change_required status', () => {
      const response = {
        status: 'password_change_required',
        tempToken: 'pw-change-temp-token',
      };

      const parsed = SignInResponseSchema.parse(response);
      expect(parsed.status).toBe('password_change_required');
      if (parsed.status === 'password_change_required') {
        expect(parsed.tempToken).toBe('pw-change-temp-token');
      }
    });

    it('rejects unknown status value', () => {
      expect(() =>
        SignInResponseSchema.parse({
          status: 'unknown_status',
          tempToken: 'xyz',
        }),
      ).toThrow();
    });
  });

  describe('TotpSetup & TotpVerify (XOR on totpCode / recoveryCode)', () => {
    it('validates TotpSetupInput & TotpSetupResponse with exactly 10 recovery codes', () => {
      const input = TotpSetupInputSchema.parse({ tempToken: 'temp-setup-token' });
      expect(input.tempToken).toBe('temp-setup-token');

      const recoveryCodes = Array.from({ length: 10 }, (_, i) => `recov-code-${i + 1}`);
      const response = TotpSetupResponseSchema.parse({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/TRIMING:admin?secret=JBSWY3DPEHPK3PXP',
        recoveryCodes,
      });

      expect(response.recoveryCodes).toHaveLength(10);

      // Rejects if not exactly 10 recovery codes
      expect(() =>
        TotpSetupResponseSchema.parse({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/TRIMING:admin',
          recoveryCodes: ['single-code'],
        }),
      ).toThrow();
    });

    it('accepts TotpVerifyInput with totpCode only', () => {
      const parsed = TotpVerifyInputSchema.parse({
        tempToken: 'token-123',
        totpCode: '123456',
      });
      expect(parsed.totpCode).toBe('123456');
    });

    it('accepts TotpVerifyInput with recoveryCode only', () => {
      const parsed = TotpVerifyInputSchema.parse({
        tempToken: 'token-123',
        recoveryCode: 'ABCD-EFGH-IJKL',
      });
      expect(parsed.recoveryCode).toBe('ABCD-EFGH-IJKL');
    });

    it('rejects TotpVerifyInput when BOTH totpCode and recoveryCode are provided', () => {
      expect(() =>
        TotpVerifyInputSchema.parse({
          tempToken: 'token-123',
          totpCode: '123456',
          recoveryCode: 'ABCD-EFGH-IJKL',
        }),
      ).toThrow();
    });

    it('rejects TotpVerifyInput when NEITHER totpCode nor recoveryCode is provided', () => {
      expect(() =>
        TotpVerifyInputSchema.parse({
          tempToken: 'token-123',
        }),
      ).toThrow();
    });
  });

  describe('ChangePassword & AdminResetPassword', () => {
    it('enforces newPassword min 10 characters and allows optional tempToken', () => {
      const validWithTemp = ChangePasswordInputSchema.parse({
        currentPassword: 'currentPassword123',
        newPassword: 'newValidPassword123!',
        tempToken: 'temp-pw-change-token',
      });
      expect(validWithTemp.newPassword).toBe('newValidPassword123!');
      expect(validWithTemp.tempToken).toBe('temp-pw-change-token');

      const validWithoutTemp = ChangePasswordInputSchema.parse({
        currentPassword: 'currentPassword123',
        newPassword: 'newValidPassword123!',
      });
      expect(validWithoutTemp.tempToken).toBeUndefined();

      // Fails with 9 characters
      expect(() =>
        ChangePasswordInputSchema.parse({
          currentPassword: 'currentPassword123',
          newPassword: 'short1234', // 9 chars
        }),
      ).toThrow();
    });

    it('validates ChangePasswordResponse and AdminResetPasswordResponse', () => {
      const changeRes = ChangePasswordResponseSchema.parse({
        success: true,
        message: 'Password changed successfully',
      });
      expect(changeRes.success).toBe(true);

      const adminResetInput = AdminResetPasswordInputSchema.parse({
        userId: '018f3a5e-0000-7000-8000-000000000001',
      });
      expect(adminResetInput.userId).toBe('018f3a5e-0000-7000-8000-000000000001');

      const adminResetRes = AdminResetPasswordResponseSchema.parse({
        userId: '018f3a5e-0000-7000-8000-000000000001',
        temporaryPassword: 'RandomPassword123!',
        mustChangePassword: true,
      });
      expect(adminResetRes.temporaryPassword).toBe('RandomPassword123!');
    });
  });

  describe('RefreshToken and SignOut (No token in body)', () => {
    it('validates empty object for RefreshTokenInput and rejects tokens in body', () => {
      const validEmpty = RefreshTokenInputSchema.parse({});
      expect(validEmpty).toEqual({});

      // Strictly rejects refreshToken in body
      expect(() =>
        RefreshTokenInputSchema.parse({
          refreshToken: 'not-allowed-in-body',
        }),
      ).toThrow();
    });

    it('validates RefreshTokenResponse and SignOutResponse', () => {
      const mockUser = {
        id: '018f3a5e-0000-7000-8000-000000000001',
        email: 'user@triming.gov.ng',
        fullName: 'Test User',
        phone: null,
        mustChangePassword: false,
        isSystemAdmin: false,
        totpEnabled: false,
        roles: ['scheme_data_officer'],
        createdAt: '2026-10-21T00:00:00.000Z',
      };

      const refreshRes = RefreshTokenResponseSchema.parse({
        accessToken: 'jwt-access-token',
        expiresIn: 900,
        user: mockUser,
      });
      expect(refreshRes.expiresIn).toBe(900);

      const signOutRes = SignOutResponseSchema.parse({ success: true });
      expect(signOutRes.success).toBe(true);
    });
  });
});
