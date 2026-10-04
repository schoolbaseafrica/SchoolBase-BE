import { BadRequestException } from '@nestjs/common';

import { AttendanceMethodPolicyService } from './attendance-method-policy.service';

describe('AttendanceMethodPolicyService', () => {
  const school = {
    id: 'school-1',
    attendance_enabled_methods: ['NFC'],
    fingerprint_provider: 'secugen',
  };
  const manager = {
    findOne: jest.fn(async () => school),
    save: jest.fn(async (value: unknown) => value),
  };
  const faceVerification = { available: false };
  const policy = new AttendanceMethodPolicyService(
    { manager } as never,
    faceVerification as never,
  );

  it('exposes the default provider and only ready methods', async () => {
    const result = await policy.get();
    expect(result.enabledMethods).toEqual(['NFC']);
    expect(result.fingerprintProvider).toBe('secugen');
    expect(result.capabilities.FINGERPRINT.available).toBe(false);
  });

  it('refuses to enable an unconfigured biometric provider', async () => {
    await expect(policy.update(['NFC', 'FINGERPRINT'])).rejects.toThrow(
      BadRequestException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('allows Face when a provider is configured', async () => {
    faceVerification.available = true;
    await expect(policy.update(['NFC', 'FACE'])).resolves.toMatchObject({
      enabledMethods: ['NFC', 'FACE'],
    });
    faceVerification.available = false;
  });

  it('does not offer Face to teachers after its provider is removed', async () => {
    school.attendance_enabled_methods = ['NFC', 'FACE'];
    faceVerification.available = false;
    await expect(policy.get()).resolves.toMatchObject({
      enabledMethods: ['NFC'],
    });
  });
});
