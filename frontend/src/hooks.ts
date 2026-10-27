import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * GET so'rovini bajaradi; url null bo'lsa hech narsa qilmaydi.
 * `reload()` ma'lumotni jim yangilaydi (sahifa spinnerga almashmaydi),
 * url o'zgarsa — eski ma'lumot tozalanib, yuklanish holati ko'rsatiladi.
 */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url) {
      lastUrl.current = null;
      setData(null);
      setLoading(false);
      return;
    }
    const isReload = lastUrl.current === url;
    lastUrl.current = url;
    if (!isReload) {
      setData(null);
      setLoading(true);
    }
    setError('');

    let cancelled = false;
    api
      .get<T>(url)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
