import type { I18n } from '@/lib/i18n';
import { docStatus } from '@/lib/calc';
import { formatDate, daysBetween } from '@/lib/format';
import { addDaysISO } from '@/lib/vehicle-file';
import { reminderText } from './reminder-text';

export type Severity = 'high' | 'normal' | 'low';
export type AttentionItem = { key: string; severity: Severity; text: string; href: string };

type Named = { id: string; name: string; plate_number?: string };
export type AttentionInput = {
  today: string;
  vehicles: Map<string, Named>;
  drivers: Map<string, { id: string; name: string; status: string; license_expiry: string | null }>;
  vehicleDocs: { id: string; vehicle_id: string; document_type: string; expires_on: string | null }[];
  driverDocs: { id: string; driver_id: string; document_type: string; expires_on: string | null }[];
  maintenance: { id: string; vehicle_id: string; service_category: string }[];
  incidents: { id: string; vehicle_id: string; title: string }[];
  reminders: { id: string; type: string; params: unknown; entity_id: string }[];
};

/** Cut-off for "soon": documents expiring within this many days (or already expired). */
export const ATTENTION_DAYS = 7;

export function attentionCutoff(today: string): string {
  return addDaysISO(today, ATTENTION_DAYS);
}

const vehicleLabel = (v: Named | undefined, fallback: string) =>
  v ? (v.plate_number ? `${v.name} (${v.plate_number})` : v.name) : fallback;

export function buildAttention(i18n: I18n, input: AttentionInput): AttentionItem[] {
  const { t, label, locale } = i18n;
  const items: AttentionItem[] = [];
  const unknown = t('common.unknown');
  const soon = (expires: string | null) => {
    if (!expires) return false;
    const left = daysBetween(input.today, expires);
    return !Number.isNaN(left) && left <= ATTENTION_DAYS;
  };

  for (const d of input.vehicleDocs) {
    if (!soon(d.expires_on)) continue;
    const expired = docStatus(d.expires_on, input.today) === 'EXPIRED';
    items.push({
      key: 'vdoc:' + d.id,
      severity: expired ? 'high' : 'normal',
      text: t(expired ? 'home.attention.vehicleDocExpired' : 'home.attention.vehicleDocSoon', {
        document: label('documentType', d.document_type),
        vehicle: vehicleLabel(input.vehicles.get(d.vehicle_id), unknown),
        date: formatDate(d.expires_on, locale),
      }),
      href: '/documents?tab=vehicle',
    });
  }
  for (const d of input.driverDocs) {
    if (!soon(d.expires_on)) continue;
    const expired = docStatus(d.expires_on, input.today) === 'EXPIRED';
    items.push({
      key: 'ddoc:' + d.id,
      severity: expired ? 'high' : 'normal',
      text: t(expired ? 'home.attention.driverDocExpired' : 'home.attention.driverDocSoon', {
        document: label('documentType', d.document_type),
        driver: input.drivers.get(d.driver_id)?.name ?? unknown,
        date: formatDate(d.expires_on, locale),
      }),
      href: '/documents?tab=driver',
    });
  }
  for (const dr of input.drivers.values()) {
    if (dr.status !== 'ACTIVE' || !soon(dr.license_expiry)) continue;
    const expired = docStatus(dr.license_expiry, input.today) === 'EXPIRED';
    items.push({
      key: 'lic:' + dr.id,
      severity: expired ? 'high' : 'normal',
      text: t(expired ? 'home.attention.licenseExpired' : 'home.attention.licenseSoon', {
        driver: dr.name,
        date: formatDate(dr.license_expiry, locale),
      }),
      href: '/documents?tab=driver',
    });
  }
  for (const m of input.maintenance) {
    items.push({
      key: 'maint:' + m.id,
      severity: 'high',
      text: t('home.attention.maintenanceOverdue', {
        service: label('serviceCategory', m.service_category),
        vehicle: vehicleLabel(input.vehicles.get(m.vehicle_id), unknown),
      }),
      href: `/maintenance?vehicle=${m.vehicle_id}`,
    });
  }
  for (const inc of input.incidents) {
    items.push({
      key: 'inc:' + inc.id,
      severity: 'normal',
      text: t('home.attention.incidentOpen', {
        vehicle: vehicleLabel(input.vehicles.get(inc.vehicle_id), unknown),
        title: inc.title,
      }),
      href: `/vehicles/${inc.vehicle_id}`,
    });
  }
  for (const r of input.reminders) {
    const { message } = reminderText(i18n, r.type, r.params);
    if (!message) continue;
    items.push({
      key: 'rem:' + r.id,
      severity: 'low',
      text: message,
      href: r.type === 'MISSING_FUEL_RECORD' ? `/new/fuel?vehicle=${r.entity_id}` : '/trips',
    });
  }

  const rank: Record<Severity, number> = { high: 0, normal: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
