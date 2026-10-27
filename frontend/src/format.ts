import type { AttStatus, Role } from './types';

export const money = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ') + " so'm";

export const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
export const WEEKDAYS_SHORT = ['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha', 'Ya'];
export const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

export const MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const currentMonth = () => todayStr().slice(0, 7);

export const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].toLowerCase()} ${y}`;
};

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  admin: 'Administrator',
  teacher: "O'qituvchi",
  support_teacher: "Yordamchi o'qituvchi",
  student: "O'quvchi",
  parent: 'Ota-ona',
};

export const STATUS_LABEL: Record<AttStatus, string> = {
  present: 'Keldi',
  absent: 'Kelmadi',
  late: 'Kechikdi',
  excused: 'Sababli',
};

export const STATUS_STYLE: Record<AttStatus, string> = {
  present: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  absent: 'bg-rose-100 text-rose-800 border-rose-300',
  late: 'bg-amber-100 text-amber-800 border-amber-300',
  excused: 'bg-sky-100 text-sky-800 border-sky-300',
};

export const METHOD_LABEL = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" } as const;

export const timeRange = (s: { startTime: string; endTime: string }) => `${s.startTime}–${s.endTime}`;

/** Jadvalni "Du, Chor, Ju 15:00–16:30" ko'rinishida qisqa yozadi */
export function slotsSummary(slots: Array<{ weekday: number; startTime: string; endTime: string }>) {
  if (!slots.length) return 'Jadval kiritilmagan';
  const groups = new Map<string, number[]>();
  for (const s of slots) {
    const key = timeRange(s);
    groups.set(key, [...(groups.get(key) ?? []), s.weekday]);
  }
  return [...groups.entries()].map(([t, days]) => `${days.sort().map((d) => WEEKDAYS_SHORT[d - 1]).join(', ')} ${t}`).join(' · ');
}

const TRANSLIT: Record<string, string> = { "o'": 'o', "g'": 'g', "o‘": 'o', "g‘": 'g', "oʻ": 'o', "gʻ": 'g', "o`": 'o', "g`": 'g' };

export function genLogin(fullName: string) {
  let s = fullName.toLowerCase();
  for (const [k, v] of Object.entries(TRANSLIT)) s = s.split(k).join(v);
  const first = s.split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'user';
  return `${first}${Math.floor(100 + Math.random() * 900)}`;
}

export function genPassword(len = 8) {
  const chars = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXYZ2346789';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}
