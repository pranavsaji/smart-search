// Geographic currency resolution.
// Uses ISO 3166-1 alpha-2 country codes and ISO 4217 currency codes.
// Lookup order: keyword match → country code → currency code.

/** ISO 3166-1 alpha-2 → ISO 4217 currency */
const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  IN: 'INR', LK: 'LKR',
  US: 'USD', PR: 'USD',
  GB: 'GBP',
  FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', PT: 'EUR',
  BE: 'EUR', AT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
  JP: 'JPY',
  AU: 'AUD', NZ: 'NZD',
  CA: 'CAD',
  CN: 'CNY', HK: 'HKD', SG: 'SGD',
  TH: 'THB', ID: 'IDR', MY: 'MYR', PH: 'PHP', VN: 'VND',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP',
  ZA: 'ZAR', NG: 'NGN', KE: 'KES', EG: 'EGP',
  KR: 'KRW', TW: 'TWD',
  TR: 'TRY', RU: 'RUB',
  IL: 'ILS', PK: 'PKR', BD: 'BDT', NP: 'NPR',
  MA: 'MAD', TN: 'TND',
}

// Keyword list → ISO 3166-1 alpha-2
// Each tuple: ([keywords (lowercase)], countryCode)
// Longer/more-specific keywords should come before generic ones.
const KEYWORD_MAP: ReadonlyArray<readonly [ReadonlyArray<string>, string]> = [
  // India (extensive — large addressable market)
  [['india', 'kerala', 'kochi', 'trivandrum', 'thiruvananthapuram', 'kottayam', 'munnar', 'alleppey',
    'alappuzha', 'wayanad', 'kozhikode', 'calicut', 'thrissur', 'palakkad', 'kannur', 'malappuram',
    'mumbai', 'bombay', 'delhi', 'new delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'madras',
    'kolkata', 'calcutta', 'pune', 'ahmedabad', 'jaipur', 'agra', 'goa', 'varanasi', 'banaras',
    'amritsar', 'shimla', 'manali', 'rishikesh', 'haridwar', 'darjeeling', 'udaipur', 'jodhpur',
    'leh', 'ladakh', 'andaman', 'ooty', 'coorg', 'kodagu', 'mysore', 'mysuru', 'rajasthan',
    'gujarat', 'maharashtra', 'tamil nadu', 'karnataka'], 'IN'],

  // United Kingdom
  [['united kingdom', ' uk', 'london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'liverpool',
    'leeds', 'bristol', 'oxford', 'cambridge', 'bath', 'york', 'brighton', 'cardiff', 'belfast',
    'newcastle', 'sheffield', 'nottingham', 'england', 'scotland', 'wales', 'cornwall', 'cotswolds'], 'GB'],

  // USA
  [['united states', 'usa', 'u.s.a', 'new york', 'los angeles', 'chicago', 'san francisco', 'miami',
    'las vegas', 'seattle', 'boston', 'washington dc', 'washington d.c.', 'atlanta', 'dallas', 'houston',
    'phoenix', 'denver', 'portland', 'nashville', 'new orleans', 'hawaii', 'california', 'florida',
    'texas', 'nevada', 'colorado', 'arizona', 'illinois', 'massachusetts', 'new england', 'manhattan',
    'brooklyn', 'san diego', 'napa valley', 'yellowstone', 'grand canyon', 'orlando', 'disneyland',
    'silicon valley', 'miami beach'], 'US'],

  // France
  [['france', 'paris', 'nice', 'lyon', 'marseille', 'bordeaux', 'toulouse', 'strasbourg',
    'versailles', 'cannes', 'monaco', 'normandy', 'provence', 'alsace', 'brittany'], 'FR'],

  // Germany
  [['germany', 'berlin', 'munich', 'hamburg', 'frankfurt', 'cologne', 'düsseldorf', 'dusseldorf',
    'stuttgart', 'heidelberg', 'bavaria', 'dresden', 'nuremberg', 'freiburg', 'black forest',
    'bavarian alps', 'neuschwanstein'], 'DE'],

  // Spain
  [['spain', 'madrid', 'barcelona', 'seville', 'valencia', 'malaga', 'ibiza', 'mallorca',
    'tenerife', 'granada', 'bilbao', 'san sebastián', 'san sebastian', 'cordoba', 'toledo',
    'salamanca', 'costa del sol', 'canary islands'], 'ES'],

  // Italy
  [['italy', 'rome', 'milan', 'venice', 'florence', 'naples', 'amalfi', 'positano', 'sicily',
    'sardinia', 'turin', 'bologna', 'cinque terre', 'tuscany', 'lombardy', 'capri', 'pompeii'], 'IT'],

  // Japan
  [['japan', 'tokyo', 'osaka', 'kyoto', 'hiroshima', 'nara', 'sapporo', 'fukuoka', 'yokohama',
    'okinawa', 'hokkaido', 'nagoya', 'kobe', 'nikko', 'hakone', 'mt fuji', 'mount fuji',
    'shibuya', 'shinjuku'], 'JP'],

  // Australia
  [['australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'cairns', 'gold coast',
    'great barrier reef', 'uluru', 'tasmania', 'darwin', 'canberra', 'bondi', 'queensland',
    'new south wales', 'victoria'], 'AU'],

  // Canada
  [['canada', 'toronto', 'vancouver', 'montreal', 'calgary', 'ottawa', 'quebec', 'banff',
    'jasper', 'niagara falls', 'whistler', 'british columbia', 'ontario', 'nova scotia'], 'CA'],

  // UAE
  [['uae', 'dubai', 'abu dhabi', 'sharjah', 'united arab emirates', 'ajman', 'fujairah',
    'ras al khaimah', 'burj khalifa', 'palm jumeirah'], 'AE'],

  // Thailand
  [['thailand', 'bangkok', 'phuket', 'chiang mai', 'koh samui', 'pattaya', 'krabi',
    'koh phi phi', 'koh chang', 'hua hin', 'ayutthaya', 'sukhothai'], 'TH'],

  // Singapore
  [['singapore', 'sentosa', 'orchard road', 'marina bay'], 'SG'],

  // Indonesia
  [['indonesia', 'bali', 'jakarta', 'yogyakarta', 'lombok', 'komodo', 'raja ampat',
    'ubud', 'seminyak', 'kuta', 'nusa penida'], 'ID'],

  // Portugal
  [['portugal', 'lisbon', 'porto', 'algarve', 'madeira', 'azores', 'sintra', 'cascais',
    'faro', 'coimbra'], 'PT'],

  // Netherlands
  [['netherlands', 'amsterdam', 'rotterdam', 'the hague', 'utrecht', 'delft',
    'eindhoven', 'holland'], 'NL'],

  // Switzerland
  [['switzerland', 'zurich', 'geneva', 'bern', 'lausanne', 'interlaken', 'lucerne',
    'zermatt', 'st. moritz', 'st moritz', 'jungfrau', 'grindelwald', 'montreux'], 'CH'],

  // Malaysia
  [['malaysia', 'kuala lumpur', 'penang', 'langkawi', 'kota kinabalu', 'malacca',
    'george town', 'ipoh', 'johor bahru'], 'MY'],

  // Hong Kong
  [['hong kong', 'kowloon', 'lantau', 'victoria peak'], 'HK'],

  // South Korea
  [['south korea', 'korea', 'seoul', 'busan', 'jeju', 'incheon', 'daegu', 'gyeongju'], 'KR'],

  // New Zealand
  [['new zealand', 'auckland', 'wellington', 'christchurch', 'queenstown', 'rotorua',
    'fiordland', 'milford sound', 'hobbiton'], 'NZ'],

  // Mexico
  [['mexico', 'mexico city', 'cancun', 'cabo', 'playa del carmen', 'guadalajara', 'oaxaca',
    'tulum', 'puerto vallarta', 'san miguel de allende', 'riviera maya'], 'MX'],

  // Brazil
  [['brazil', 'rio de janeiro', 'são paulo', 'sao paulo', 'salvador', 'fortaleza',
    'manaus', 'iguazu', 'iguaçu', 'florianopolis', 'búzios'], 'BR'],

  // South Africa
  [['south africa', 'cape town', 'johannesburg', 'durban', 'pretoria', 'kruger',
    'garden route', 'knysna', 'stellenbosch'], 'ZA'],

  // Israel
  [['israel', 'tel aviv', 'jerusalem', 'haifa', 'eilat', 'dead sea', 'nazareth'], 'IL'],

  // Morocco
  [['morocco', 'marrakech', 'casablanca', 'fez', 'fès', 'rabat', 'essaouira',
    'chefchaouen', 'agadir', 'sahara'], 'MA'],

  // Turkey
  [['turkey', 'istanbul', 'cappadocia', 'antalya', 'bodrum', 'izmir', 'ankara',
    'pamukkale', 'ephesus'], 'TR'],

  // Vietnam
  [['vietnam', 'hanoi', 'ho chi minh', 'saigon', 'hoi an', 'da nang', 'halong bay',
    'nha trang', 'hue', 'phu quoc'], 'VN'],

  // Philippines
  [['philippines', 'manila', 'cebu', 'palawan', 'boracay', 'siargao', 'davao',
    'el nido', 'coron', 'tagaytay'], 'PH'],

  // Greece
  [['greece', 'athens', 'santorini', 'mykonos', 'crete', 'rhodes', 'corfu',
    'thessaloniki', 'meteora', 'olympia'], 'GR'],

  // Sweden
  [['sweden', 'stockholm', 'gothenburg', 'malmö', 'malmo', 'kiruna', 'lapland'], 'SE'],

  // Norway
  [['norway', 'oslo', 'bergen', 'tromsø', 'tromso', 'stavanger', 'fjords', 'lofoten',
    'northern lights'], 'NO'],
]

/** Returns ISO 4217 currency code for a destination string. Falls back to USD. */
export function getCurrencyForDestination(destination: string): string {
  const lower = destination.toLowerCase()
  for (const [keywords, countryCode] of KEYWORD_MAP) {
    if (keywords.some(k => lower.includes(k))) {
      return COUNTRY_CURRENCY[countryCode] ?? 'USD'
    }
  }
  return 'USD'
}

/** ISO 4217 currency → best Intl locale for formatting */
export function getLocaleForCurrency(currency: string): string {
  const CURRENCY_LOCALE: Readonly<Record<string, string>> = {
    INR: 'en-IN', GBP: 'en-GB', EUR: 'de-DE', JPY: 'ja-JP',
    AUD: 'en-AU', CAD: 'en-CA', NZD: 'en-NZ', SGD: 'en-SG',
    HKD: 'zh-HK', KRW: 'ko-KR', CNY: 'zh-CN', TWD: 'zh-TW',
    THB: 'th-TH', MYR: 'ms-MY', IDR: 'id-ID', PHP: 'en-PH',
    AED: 'ar-AE', SAR: 'ar-SA', ILS: 'he-IL', TRY: 'tr-TR',
    BRL: 'pt-BR', MXN: 'es-MX', ZAR: 'en-ZA', RUB: 'ru-RU',
    CHF: 'de-CH', SEK: 'sv-SE', NOK: 'nb-NO', DKK: 'da-DK',
  }
  return CURRENCY_LOCALE[currency] ?? 'en-US'
}

/** Scale a GBP base price (minor units) to another currency */
const GBP_SCALE: Readonly<Record<string, number>> = {
  GBP: 1, USD: 1.27, EUR: 1.17, INR: 106, JPY: 193,
  AUD: 1.96, NZD: 2.13, CAD: 1.74, CHF: 1.14, SGD: 1.72,
  HKD: 9.96, KRW: 1680, CNY: 9.18, TWD: 40.5,
  AED: 4.67, SAR: 4.76, QAR: 4.63, KWD: 0.39, ILS: 4.74,
  THB: 44.5, MYR: 5.98, IDR: 20400, PHP: 71.2, VND: 31600,
  BRL: 6.38, MXN: 22.3, ARS: 1120, CLP: 1150, COP: 5050,
  ZAR: 23.7, NGN: 1890, KES: 164, EGP: 62.5,
  TRY: 41.2, RUB: 115, PKR: 354, BDT: 139, NPR: 169,
  MAD: 12.7, TND: 3.93, SEK: 13.6, NOK: 13.7, DKK: 8.74, PLN: 5.02,
}

export function scalePriceFromGBP(gbpMinorUnits: number, toCurrency: string): number {
  return Math.round(gbpMinorUnits * (GBP_SCALE[toCurrency] ?? 1))
}

/** Format a minor-unit amount for display */
export function formatPrice(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(getLocaleForCurrency(currency), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100)
}
