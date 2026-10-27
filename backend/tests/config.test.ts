import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Sozlamalar (.env)', () => {
  it("bo'sh qiymatlar standart qiymatga qaytadi (.env.example nusxasi bilan ishlashi uchun)", async () => {
    vi.stubEnv('DB_PATH', '');
    vi.stubEnv('PORT', '');
    vi.stubEnv('SUPER_ADMIN_LOGIN', '');
    vi.stubEnv('SUPER_ADMIN_PASSWORD', '');
    vi.resetModules();
    const { config } = await import('../src/config.js');
    expect(config.dbPath).toMatch(/lc_crm\.db$/);
    expect(config.port).toBe(4000);
    expect(config.superAdminLogin).toBe('superadmin');
    expect(config.superAdminPasswordIsDefault).toBe(true);
  });

  it("production'da JWT_SECRET bo'lmasa ishga tushmaydi", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');
    vi.resetModules();
    await expect(import('../src/config.js')).rejects.toThrow(/JWT_SECRET/);
  });

  it("production'da super admin standart parol bilan yaratilmaydi, parol berilsa yaratiladi", async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.stubEnv('SUPER_ADMIN_PASSWORD', '');
    vi.resetModules();
    const { openDb } = await import('../src/db.js');
    const { ensureSuperAdmin } = await import('../src/bootstrap.js');
    expect(() => ensureSuperAdmin(openDb(':memory:'))).toThrow(/SUPER_ADMIN_PASSWORD/);

    vi.stubEnv('SUPER_ADMIN_PASSWORD', 'KuchliParol2026');
    vi.resetModules();
    const db2 = (await import('../src/db.js')).openDb(':memory:');
    const boot2 = await import('../src/bootstrap.js');
    expect(boot2.ensureSuperAdmin(db2)).toBe(true);
    expect(boot2.ensureSuperAdmin(db2)).toBe(false); // ikkinchi marta yaratilmaydi
  });
});
