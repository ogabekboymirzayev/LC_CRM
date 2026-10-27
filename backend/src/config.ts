import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProd) {
    throw new Error("JWT_SECRET muhit o'zgaruvchisi production uchun majburiy (.env faylga yozing)");
  }
  // Dev/test uchun vaqtinchalik tasodifiy kalit (server qayta ishga tushganda tokenlar bekor bo'ladi)
  jwtSecret = crypto.randomBytes(32).toString('hex');
  if (!isTest) console.warn("[config] JWT_SECRET berilmagan — vaqtinchalik kalit ishlatilmoqda");
}

export const config = {
  isProd,
  isTest,
  port: Number(process.env.PORT || 4000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dbPath: process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'lc_crm.db'),
  superAdminLogin: process.env.SUPER_ADMIN_LOGIN || 'superadmin',
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || 'Admin12345',
  superAdminPasswordIsDefault: !process.env.SUPER_ADMIN_PASSWORD,
  corsOrigin: process.env.CORS_ORIGIN || '',
};
