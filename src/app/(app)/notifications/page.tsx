import { requireViewer } from '@/lib/auth';
import { getI18n, type I18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import { Badge, Card, EmptyState, Flash, PageHeader, Section } from '@/components/ui';
import { priorityTone, reminderText } from '@/components/home/reminder-text';
import { rows } from '@/components/home/query';
import { markRead, resolveReminder } from './actions';

type Notification = {
  delivery_id: string;
  delivery_status: string;
  reminder_id: string;
  type: string;
  params: unknown;
  due_on: string | null;
  priority: string;
  reminder_status: string;
  created_at: string;
};

const btn =
  'inline-flex min-h-12 min-w-24 flex-1 items-center justify-center rounded-xl px-4 text-base font-semibold leading-snug';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireViewer();
  const sp = await searchParams;
  const i18n = await getI18n();
  const { t } = i18n;
  const supabase = await createClient();

  const res = await supabase
    .from('v_notifications')
    .select('delivery_id, delivery_status, reminder_id, type, params, due_on, priority, reminder_status, created_at')
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const all = rows<Notification>(res);

  const pending = all.filter((n) => n.reminder_status === 'PENDING' || n.reminder_status === 'SCHEDULED');
  const earlier = all.filter((n) => n.reminder_status !== 'PENDING' && n.reminder_status !== 'SCHEDULED');

  return (
    <div>
      <PageHeader title={t('notifications.title')} />
      <Flash saved={sp.saved} error={sp.error} />

      {all.length === 0 ? (
        <EmptyState title={t('notifications.empty')} hint={t('notifications.emptyHint')} />
      ) : (
        <>
          <Section title={t('notifications.pendingTitle')}>
            {pending.length === 0 ? (
              <EmptyState title={t('notifications.noPending')} />
            ) : (
              <ul className="space-y-3">
                {pending.map((n) => (
                  <li key={n.delivery_id}>
                    <NotificationCard n={n} i18n={i18n} actions />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {earlier.length > 0 ? (
            <details className="mb-6 rounded-2xl border border-line bg-surface">
              <summary className="flex min-h-12 cursor-pointer items-center px-4 text-base font-semibold">
                {t('notifications.earlier', { n: earlier.length })}
              </summary>
              <ul className="space-y-3 p-3">
                {earlier.map((n) => (
                  <li key={n.delivery_id}>
                    <NotificationCard n={n} i18n={i18n} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}

function NotificationCard({ n, i18n, actions = false }: { n: Notification; i18n: I18n; actions?: boolean }) {
  const { t, label, locale } = i18n;
  const text = reminderText(i18n, n.type, n.params);
  const unread = n.delivery_status !== 'READ';
  return (
    <Card className={unread && actions ? 'border-brand' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={priorityTone(n.priority)}>
          {t('notifications.priority')}: {label('priority', n.priority)}
        </Badge>
        {actions ? (
          <Badge tone={unread ? 'blue' : 'gray'}>
            <span aria-hidden="true">{unread ? '● ' : '○ '}</span>
            {unread ? t('notifications.unread') : t('notifications.read')}
          </Badge>
        ) : (
          <Badge tone="gray">
            {n.reminder_status === 'DISMISSED' ? t('notifications.statusDismissed') : t('notifications.statusCompleted')}
          </Badge>
        )}
      </div>
      <p className={`mt-2 text-lg leading-snug ${unread && actions ? 'font-bold' : 'font-semibold'}`}>{text.title}</p>
      {text.message ? <p className="mt-1 text-base leading-snug">{text.message}</p> : null}
      {n.due_on ? (
        <p className="mt-1 text-sm text-muted">{t('reminders.dueOn', { date: formatDate(n.due_on, locale) })}</p>
      ) : null}
      {actions ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {unread ? (
            <form action={markRead.bind(null, n.delivery_id)} className="flex flex-1">
              <button type="submit" className={`${btn} border border-line bg-surface hover:bg-muted-soft`}>
                {t('notifications.markRead')}
              </button>
            </form>
          ) : null}
          <form action={resolveReminder.bind(null, n.reminder_id, 'COMPLETED')} className="flex flex-1">
            <button type="submit" className={`${btn} bg-brand text-on-brand hover:bg-brand-strong`}>
              {t('notifications.done')}
            </button>
          </form>
          <form action={resolveReminder.bind(null, n.reminder_id, 'DISMISSED')} className="flex flex-1">
            <button type="submit" className={`${btn} border border-line bg-surface hover:bg-muted-soft`}>
              {t('notifications.dismiss')}
            </button>
          </form>
        </div>
      ) : null}
    </Card>
  );
}
