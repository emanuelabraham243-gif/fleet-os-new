import type { I18n } from '@/lib/i18n';

/** Reminder text is never stored: render type + params in the viewer's language. */
export function reminderText(
  i18n: Pick<I18n, 'dict' | 't' | 'label'>,
  type: string,
  params: unknown,
): { title: string; message: string } {
  const known = (i18n.dict.reminders as Record<string, unknown>)[type];
  const vars: Record<string, string | number> = {};
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') vars[k] = v;
    }
  }
  // Translate codes before interpolation.
  if (typeof vars.document_type === 'string') vars.document_type = i18n.label('documentType', vars.document_type);
  if (typeof vars.service_category === 'string') {
    vars.service_category = i18n.label('serviceCategory', vars.service_category);
  }
  if (!known || typeof known !== 'object') return { title: type, message: '' };
  return {
    title: i18n.t(`reminders.${type}.title`, vars),
    message: i18n.t(`reminders.${type}.message`, vars),
  };
}

export function priorityTone(priority: string): 'red' | 'amber' | 'gray' {
  return priority === 'high' ? 'red' : priority === 'normal' ? 'amber' : 'gray';
}
