export type Role = 'super_admin' | 'admin' | 'teacher' | 'support_teacher' | 'student' | 'parent';
export type AttStatus = 'present' | 'absent' | 'late' | 'excused';

export interface SessionUser {
  id: number;
  role: Role;
  centerId: number | null;
  fullName: string;
  phone: string | null;
  login: string;
  centerName: string | null;
}

export interface UserRow {
  id: number;
  role: Role;
  centerId: number | null;
  centerName?: string | null;
  fullName: string;
  phone: string | null;
  login: string;
  birthDate: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  parentNames: string | null;
  childNames: string | null;
  groupsCount: number;
}

export interface UserDetail extends Omit<UserRow, 'parentNames' | 'childNames' | 'groupsCount'> {
  parents: Array<{ id: number; fullName: string; phone: string | null }>;
  children: Array<{ id: number; fullName: string; phone: string | null }>;
  groups: Array<{ id: number; name: string }>;
}

export interface Slot {
  id?: number;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
}

export interface GroupRow {
  id: number;
  name: string;
  subject: string | null;
  teacherId: number | null;
  teacherName: string | null;
  supportTeacherId: number | null;
  supportTeacherName: string | null;
  monthlyPrice: number;
  startDate: string | null;
  active: boolean;
  studentsCount: number;
  slots: Slot[];
}

export interface GroupDetail {
  id: number;
  name: string;
  subject: string | null;
  monthlyPrice: number;
  startDate: string | null;
  active: boolean;
  teacher: { id: number; fullName: string; phone: string | null } | null;
  supportTeacher: { id: number; fullName: string; phone: string | null } | null;
  students: Array<{ id: number; fullName: string; phone: string | null; joinedAt: string }>;
  slots: Slot[];
}

export interface Lesson {
  id: number;
  groupId: number;
  groupName: string;
  subject: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
  teacherName: string | null;
  studentNames?: string[];
}

export interface Stats {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number | null;
}

export interface Billing {
  expected: number;
  paid: number;
  debt: number;
  overpaid: number;
}

export interface PaymentRow {
  id: number;
  studentId: number;
  studentName: string;
  groupId: number | null;
  groupName: string | null;
  amount: number;
  method: 'cash' | 'card' | 'transfer';
  periodMonth: string;
  paidAt: string;
  note: string | null;
  createdByName: string | null;
}

export interface StudentOverview {
  student: { id: number; fullName: string; phone: string | null; login: string; birthDate: string | null; address: string | null; notes: string | null; active: boolean };
  parents: Array<{ id: number; fullName: string; phone: string | null }>;
  groups: Array<{ id: number; name: string; subject: string | null; monthlyPrice: number; teacherName: string | null; supportTeacherName: string | null; joinedAt: string }>;
  slots: Array<{ groupId: number; weekday: number; startTime: string; endTime: string; room: string | null }>;
  attendance: { stats: Stats; recent: Array<{ date: string; groupName: string; status: AttStatus; note: string | null }>; days: number };
  money: null | {
    currentMonth: { month: string } & Billing;
    totalDebt: number;
    months: Array<{ month: string } & Billing>;
    payments: Array<{ id: number; amount: number; method: PaymentRow['method']; periodMonth: string; paidAt: string; note: string | null; groupName: string | null }>;
  };
}
