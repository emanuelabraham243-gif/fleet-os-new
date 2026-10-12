import { requireViewer, isAdmin } from '@/lib/auth';
import { getI18n } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';
import { formatEthiopianMobile } from '@/lib/phone';
import { Badge, Card, EmptyState, Flash, PageHeader } from '@/components/ui';
import { rows } from '@/components/home/query';
import { AddPersonForm, TempPasswordForm } from './user-forms';
import { removePerson } from './actions';

type SP = Promise<Record<string, string | string[] | undefined>>;
type Member = { id: string; full_name: string; phone: string; role: string; user_id: string | null };

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { user, profile } = await requireViewer();
  const { t, label } = await getI18n();

  if (!isAdmin(profile)) {
    return (
      <>
        <PageHeader title={t('users.title')} />
        <p className="text-base text-muted">{t('errors.noPermission')}</p>
      </>
    );
  }

  const supabase = await createClient();
  const members = rows<Member>(
    await supabase.from('org_phone_members').select('id, full_name, phone, role, user_id').order('full_name'),
  );

  return (
    <>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} />
      <Flash saved={sp.saved} error={sp.error} />

      <details className="mb-4 rounded-2xl border border-line bg-surface p-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">{t('users.add')}</summary>
        <div className="mt-3">
          <AddPersonForm />
        </div>
      </details>

      {members.length === 0 ? (
        <EmptyState title={t('users.empty')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {members.map((m) => (
            <li key={m.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">
                      {m.full_name}
                      {m.user_id === user.id ? <span className="text-muted"> ({t('users.you')})</span> : null}
                    </p>
                    <p className="text-base tabular-nums text-muted">{formatEthiopianMobile(m.phone)}</p>
                  </div>
                  <Badge tone={m.user_id ? 'green' : 'amber'}>
                    {m.user_id ? t('users.signedUp') : t('users.notSignedUp')}
                  </Badge>
                </div>
                <p className="mt-2 text-base">
                  <span className="text-muted">{t('users.role')}: </span>
                  {label('role', m.role)}
                </p>
                {m.user_id ? (
                  <details className="mt-3">
                    <summary className="flex min-h-12 cursor-pointer items-center text-base font-semibold text-brand-ink">
                      {t('users.tempPassword')}
                    </summary>
                    <div className="mt-3">
                      <TempPasswordForm id={m.id} />
                    </div>
                  </details>
                ) : (
                  <form action={removePerson} className="mt-3">
                    <input type="hidden" name="id" value={m.id} />
                    <button
                      type="submit"
                      className="min-h-12 rounded-xl border border-line bg-surface px-4 text-base font-semibold text-bad-ink hover:bg-muted-soft"
                    >
                      {t('users.remove')}
                    </button>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
