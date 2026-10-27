import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { WEEKDAYS } from '../format';
import type { Lesson } from '../types';
import { Empty, ErrorBox, Loading, PageHeader } from '../ui';

export default function Schedule() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch<Lesson[]>('/schedule');
  const today = new Date().getDay() === 0 ? 7 : new Date().getDay();

  return (
    <>
      <PageHeader title="Dars jadvali" subtitle="Haftalik darslar" />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <Empty title="Dars jadvali bo'sh" hint={user?.role === 'admin' ? "Guruh yaratayotganda dars kunlarini kiriting" : "Hozircha darslar biriktirilmagan"} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {WEEKDAYS.map((name, i) => {
            const day = i + 1;
            const lessons = data.filter((l) => l.weekday === day);
            const isToday = day === today;
            return (
              <section key={name} className={`rounded-xl border bg-white p-4 shadow-sm ${isToday ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'} ${lessons.length ? '' : 'opacity-60'}`}>
                <h2 className="mb-2 flex items-center justify-between font-semibold text-slate-900">
                  {name}
                  {isToday && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">Bugun</span>}
                </h2>
                {lessons.length === 0 ? (
                  <p className="text-sm text-slate-500">Dars yo'q</p>
                ) : (
                  <ul className="space-y-2">
                    {lessons.map((l) => (
                      <li key={l.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="font-semibold text-indigo-700">{l.startTime}–{l.endTime}</div>
                        <Link to={`/groups/${l.groupId}`} className="font-medium text-slate-900 hover:text-indigo-700">{l.groupName}</Link>
                        <div className="text-slate-500">
                          {[l.room, l.teacherName].filter(Boolean).join(' · ')}
                        </div>
                        {l.studentNames && l.studentNames.length > 0 && <div className="mt-1 text-xs text-slate-500">👤 {l.studentNames.join(', ')}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
