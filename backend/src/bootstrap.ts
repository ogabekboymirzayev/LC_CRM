import bcrypt from 'bcryptjs';
import type { DB } from './db.js';
import { config } from './config.js';

/** Tizimda super admin bo'lmasa, .env dagi ma'lumotlar bilan yaratadi. */
export function ensureSuperAdmin(db: DB): boolean {
  const exists = db.prepare("SELECT 1 FROM users WHERE role = 'super_admin'").get();
  if (exists) return false;
  if (config.isProd && config.superAdminPasswordIsDefault) {
    throw new Error("Production uchun SUPER_ADMIN_PASSWORD muhit o'zgaruvchisini (.env) o'rnating — standart parol bilan ishga tushmaydi");
  }
  db.prepare(
    `INSERT INTO users (center_id, role, full_name, login, password_hash) VALUES (NULL, 'super_admin', 'Super Admin', ?, ?)`,
  ).run(config.superAdminLogin, bcrypt.hashSync(config.superAdminPassword, 10));
  return true;
}
