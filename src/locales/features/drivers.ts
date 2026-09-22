import type { Widen } from '../../lib/i18n-core';

export const en = {
  drivers: {
    title: 'Drivers',
    empty: 'No drivers yet',
    emptyHint: 'Drivers you add will appear here.',
    addDriver: 'Add driver',
    form: {
      name: 'Full name',
      phone: 'Phone',
      licenseNumber: 'License number',
      licenseExpiry: 'License expiry',
    },
  },
};

export const am: Widen<typeof en> = {
  drivers: {
    title: 'አሽከርካሪዎች',
    empty: 'እስካሁን አሽከርካሪ የለም',
    emptyHint: 'የሚጨምሯቸው አሽከርካሪዎች እዚህ ይታያሉ።',
    addDriver: 'አሽከርካሪ ጨምር',
    form: {
      name: 'ሙሉ ስም',
      phone: 'ስልክ',
      licenseNumber: 'የመንጃ ፈቃድ ቁጥር',
      licenseExpiry: 'የመንጃ ፈቃድ ማብቂያ',
    },
  },
};
