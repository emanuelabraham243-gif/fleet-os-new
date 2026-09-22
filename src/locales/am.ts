import type { Widen } from '../lib/i18n-core';
import type { en } from './en';

// NOTE: Amharic terms need native-speaker review against the office paperwork.
export const am: Widen<typeof en> = {
  common: {
    save: 'አስቀምጥ', saving: 'በማስቀመጥ ላይ…', saved: 'ተቀምጧል', cancel: 'ይቅር', add: 'ጨምር', edit: 'አስተካክል',
    back: 'ተመለስ', retry: 'እንደገና ሞክር', loading: 'በመጫን ላይ…', all: 'ሁሉም', none: 'ምንም', yes: 'አዎ', no: 'አይ',
    unknown: 'ያልታወቀ', insufficientData: 'በቂ መረጃ የለም', currency: 'ብር', km: 'ኪ.ሜ', liters: 'ሊ',
    date: 'ቀን', notes: 'ማስታወሻ', status: 'ሁኔታ', vehicle: 'ተሽከርካሪ', driver: 'አሽከርካሪ',
    plate: 'ታርጋ ቁጥር', amount: 'መጠን', reason: 'ምክንያት', open: 'ክፈት', viewAll: 'ሁሉንም ይመልከቱ',
    actions: 'እርምጃዎች', demoBanner: 'የማሳያ መረጃ ነው። የሚታዩት ቁጥሮች ለማሳያ ብቻ ናቸው።',
    offline: 'ከኢንተርኔት ውጭ ነዎት። አሁን ለውጦችን ማስቀመጥ አይቻልም።', filter: 'አጣራ', search: 'ፈልግ',
  },
  nav: {
    home: 'ዋና', vehicles: 'ተሽከርካሪ', trips: 'ጉዞ', maintenance: 'ጥገና', expenses: 'ወጪ',
    documents: 'ሰነድ', notifications: 'ማሳወቂያ', account: 'መለያ',
  },
  navFull: {
    home: 'የቁጥጥር ማዕከል', vehicles: 'ተሽከርካሪዎች', trips: 'ጉዞዎች', maintenance: 'ጥገና',
    expenses: 'ወጪዎች', documents: 'ሰነዶች',
  },
  shell: {
    appName: 'FleetOS', skipToContent: 'ወደ ዋናው ይዘት ዝለል', switchLanguage: 'ቋንቋ ቀይር',
    notificationsLabel: 'ማሳወቂያዎች', menu: 'ምናሌ',
  },
  auth: {
    title: 'ወደ FleetOS ይግቡ', email: 'ኢሜይል', password: 'የይለፍ ቃል', signIn: 'ግባ',
    magicLink: 'የመግቢያ ሊንክ በኢሜይል ላክልኝ', linkSent: 'የመግቢያ ሊንክ ተልኳል።', invalidCreds: 'ኢሜይሉ ወይም የይለፍ ቃሉ ትክክል አይደለም።',
    noProfile: 'ይህ መለያ ገና ከድርጅት ጋር አልተገናኘም። እባክዎ አስተዳዳሪዎን ያነጋግሩ።',
    signOut: 'ውጣ', or: 'ወይም', checkEmail: 'የመግቢያ ሊንኩን ለማግኘት ኢሜይልዎን ይመልከቱ።',
  },
  account: {
    title: 'መለያ', language: 'ቋንቋ', setPassword: 'የይለፍ ቃል ያዘጋጁ', newPassword: 'አዲስ የይለፍ ቃል',
    passwordSaved: 'የይለፍ ቃል ተቀምጧል።', role: 'ሚና', organization: 'ድርጅት',
    passwordTooShort: 'የይለፍ ቃል ቢያንስ 8 ፊደላት መሆን አለበት።',
  },
  enums: {
    vehicleStatus: { AVAILABLE: 'ዝግጁ', ON_TRIP: 'በጉዞ ላይ', MAINTENANCE: 'በጥገና ላይ', OUT_OF_SERVICE: 'ከአገልግሎት ውጭ' },
    tripStatus: { PLANNED: 'የታቀደ', IN_PROGRESS: 'በሂደት ላይ', COMPLETED: 'ተጠናቋል', CANCELLED: 'ተሰርዟል' },
    docStatus: { VALID: 'አገልግሎት ላይ ያለ', EXPIRING_SOON: 'በቅርቡ ያበቃል', EXPIRED: 'ያበቃለት', UNKNOWN: 'ያልታወቀ' },
    maintenanceStatus: { OVERDUE: 'ጊዜው አልፏል', DUE_SOON: 'በቅርቡ ይደርሳል', OK: 'ደህና', UNKNOWN: 'ያልታወቀ' },
    gpsState: { LIVE: 'ቀጥታ', DELAYED: 'የዘገየ', OFFLINE: 'ከመስመር ውጭ', UNKNOWN: 'ያልታወቀ' },
    expenseCategory: {
      FUEL: 'ነዳጅ', DRIVER_ALLOWANCE: 'የአሽከርካሪ አበል', TOLL: 'የመንገድ ክፍያ', LOADING: 'ጭነት',
      PARKING: 'የመኪና ማቆሚያ', REPAIR: 'ጥገና', FINE: 'ቅጣት', OTHER: 'ሌላ',
    },
    fuelType: { DIESEL: 'ናፍጣ', PETROL: 'ቤንዚን' },
    serviceCategory: {
      OIL_CHANGE: 'የዘይት ለውጥ', TIRES: 'ጎማዎች', BRAKES: 'ፍሬኖች', BATTERY: 'ባትሪ', FILTERS: 'ማጣሪያዎች',
      GENERAL_SERVICE: 'አጠቃላይ አገልግሎት', OTHER: 'ሌላ',
    },
    documentType: {
      INSURANCE: 'ኢንሹራንስ', ANNUAL_INSPECTION: 'ዓመታዊ ቁጥጥር (ቦሎ)', REGISTRATION: 'ሊብሬ',
      MEDICAL_CERTIFICATE: 'የጤና ምስክር ወረቀት', DRIVING_LICENSE: 'መንጃ ፈቃድ', OTHER: 'ሌላ',
    },
    incidentStatus: { OPEN: 'ክፍት', REVIEWED: 'የተገመገመ', CLOSED: 'የተዘጋ' },
    driverStatus: { ACTIVE: 'ንቁ', INACTIVE: 'ንቁ ያልሆነ' },
    role: { admin: 'አስተዳዳሪ', staff: 'ሠራተኛ' },
    priority: { low: 'ዝቅተኛ', normal: 'መደበኛ', high: 'ከፍተኛ' },
  },
  errors: {
    required: 'ይህ መስክ መሞላት አለበት።', invalidNumber: 'ትክክለኛ ቁጥር ያስገቡ።', invalidDate: 'ትክክለኛ ቀን ያስገቡ።',
    futureDate: 'ቀኑ ወደፊት ነው።', tooLong: 'ጽሑፉ በጣም ረጅም ነው።', invalidChoice: 'ከአማራጮቹ አንዱን ይምረጡ።',
    generic: 'የሆነ ችግር ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።', noPermission: 'ይህን ለማድረግ ፈቃድ የለዎትም።',
    offline: 'ግንኙነት የለም። ኢንተርኔት ሲኖርዎ እንደገና ይሞክሩ።',
    duplicate: 'በእነዚህ ዝርዝሮች የተመዘገበ መዝገብ አስቀድሞ አለ።',
    saveAnyway: 'ቢሆንም አስቀምጥ',
    vehicleBusy: 'ይህ ተሽከርካሪ አስቀድሞ በሂደት ላይ ያለ ጉዞ አለው።',
    vehicleUnavailable: 'ይህ ተሽከርካሪ አሁን በጥገና ላይ ወይም ከአገልግሎት ውጭ ነው።',
    driverInactive: 'ይህ አሽከርካሪ ንቁ አይደለም።',
    expenseVehicle: 'የወጪው ተሽከርካሪ ከጉዞው ተሽከርካሪ ጋር አይመሳሰልም።',
    badReference: 'የተመረጠው ንጥል አሁን የለም።',
    odometerJump: 'ይህ የኦዶሜትር ንባብ ከቀዳሚው በእጅጉ ይለያል። እባክዎ ያረጋግጡ ወይም ቢሆንም ያስቀምጡ።',
    voidReasonRequired: 'ምክንያት መጻፍ ያስፈልጋል።', notFound: 'አልተገኘም።',
  },
  reminders: {
    VEHICLE_DOCUMENT_EXPIRY: { title: 'የተሽከርካሪ ሰነድ ማብቂያ', message: 'የ{vehicle_name} ({plate_number}) {document_type}፦ የማብቂያ ቀኑን ያረጋግጡ።' },
    DRIVER_DOCUMENT_EXPIRY: { title: 'የአሽከርካሪ ሰነድ ማብቂያ', message: 'የ{driver_name} {document_type}፦ የማብቂያ ቀኑን ያረጋግጡ።' },
    DRIVER_LICENSE_EXPIRY: { title: 'የመንጃ ፈቃድ ማብቂያ', message: 'የ{driver_name} መንጃ ፈቃድ፦ የማብቂያ ቀኑን ያረጋግጡ።' },
    MAINTENANCE_DUE: { title: 'ጥገና ደርሷል', message: 'የ{vehicle_name} ({plate_number}) {service_category} ጊዜ ደርሷል።' },
    UPCOMING_TRIP: { title: 'የሚመጣ ጉዞ', message: 'ከ{origin} ወደ {destination} በ{vehicle_name} የሚደረግ ጉዞ።' },
    MISSING_FUEL_RECORD: { title: 'የነዳጅ መዝገብ የለም', message: 'ለ{vehicle_name} ({plate_number}) በቅርቡ የተመዘገበ የነዳጅ መዝገብ አልተገኘም።' },
    MISSING_TRIP_REVENUE: { title: 'የጉዞ ገቢ አልተመዘገበም', message: 'ከ{origin} ወደ {destination} ለተደረገው ጉዞ ገቢ አልተመዘገበም።' },
    STALE_TRIP: { title: 'ጉዞው አሁንም በሂደት ላይ ነው', message: 'ከ{origin} ወደ {destination} የሚደረገው ጉዞ ለረጅም ጊዜ በሂደት ላይ ነው።' },
    dueOn: 'የሚደርሰው {date}',
  },
  gps: {
    title: 'የGPS ምልክት', lastSignalMinutes: 'የመጨረሻው ምልክት ከ{n} ደቂቃ በፊት ደርሷል',
    lastSignalHours: 'የመጨረሻው ምልክት ከ{n} ሰዓት በፊት ደርሷል', noSignal: 'ምንም ምልክት አልደረሰም',
    mockNote: 'ለማሳያ የቀረበ የናሙና GPS መረጃ ነው። ምንም ቀጥታ መከታተያ አልተገናኘም።', position: 'የመጨረሻው የተመዘገበ ቦታ',
  },
  void: { title: 'መዝገብ ውድቅ አድርግ', reasonLabel: 'ውድቅ የተደረገበት ምክንያት', confirm: 'ውድቅ አድርግ' },
  states: {
    emptyTitle: 'እስካሁን ምንም የለም', errorTitle: 'ይህን ገጽ መጫን አልተቻለም',
    errorHint: 'ግንኙነትዎን ያረጋግጡ እና እንደገና ይሞክሩ።', notFoundTitle: 'ገጹ አልተገኘም',
    notFoundHint: 'የሚፈልጉት ገጽ ወይም መዝገብ የለም።',
  },
};
