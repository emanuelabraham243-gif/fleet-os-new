'use client';

import { useSyncExternalStore } from 'react';
import { useI18n } from '@/lib/i18n-client';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function OfflineBanner() {
  const { t } = useI18n();
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      className="bg-warn-soft px-4 py-2 text-center text-base font-medium text-warn-ink"
    >
      {t('common.offline')}
    </div>
  );
}
