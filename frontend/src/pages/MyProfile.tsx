import { Navigate } from 'react-router-dom';
import { useFetch } from '../hooks';
import { Empty, ErrorBox, Loading } from '../ui';

/** O'quvchi yoki ota-ona uchun: birinchi (yoki yagona) farzand profiliga yo'naltiradi. */
export default function MyProfile() {
  const { data, loading, error, reload } = useFetch<Array<{ id: number; fullName: string }>>('/students/mine');
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || data.length === 0) return <Empty title="Farzandlar biriktirilmagan" hint="O'quv markaz administratoriga murojaat qiling" />;
  return <Navigate to={`/students/${data[0].id}`} replace />;
}
