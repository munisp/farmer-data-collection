import { logger } from "../logger.js";

export type SupportedLocale = "en" | "sw" | "ha" | "yo" | "fr" | "am";

const translations: Record<SupportedLocale, Record<string, string>> = {
  en: {
    "common.welcome": "Welcome to FarmConnect",
    "common.login": "Login", "common.logout": "Logout", "common.save": "Save", "common.cancel": "Cancel", "common.submit": "Submit",
    "common.loading": "Loading...", "common.error": "An error occurred", "common.success": "Success",
    "nav.dashboard": "Dashboard", "nav.marketplace": "Marketplace", "nav.loans": "Loans", "nav.delivery": "Delivery",
    "nav.weather": "Weather", "nav.settings": "Settings", "nav.aquaculture": "Aquaculture", "nav.insurance": "Insurance",
    "farmer.profile": "Farmer Profile", "farmer.farms": "My Farms", "farmer.crops": "My Crops", "farmer.harvest": "Harvest Records",
    "market.sell": "Sell Produce", "market.buy": "Buy Produce", "market.price": "Current Price", "market.listings": "Listings",
    "loan.apply": "Apply for Loan", "loan.status": "Loan Status", "loan.repay": "Make Repayment", "loan.history": "Loan History",
    "delivery.track": "Track Delivery", "delivery.schedule": "Schedule Pickup", "delivery.history": "Delivery History",
    "weather.forecast": "Weather Forecast", "weather.alerts": "Weather Alerts", "weather.advisory": "Farm Advisory",
    "insurance.buy": "Buy Insurance", "insurance.claim": "File Claim", "insurance.policies": "My Policies",
    "notification.new_order": "New order received", "notification.payment": "Payment received", "notification.delivery": "Delivery update",
  },
  sw: {
    "common.welcome": "Karibu FarmConnect",
    "common.login": "Ingia", "common.logout": "Toka", "common.save": "Hifadhi", "common.cancel": "Ghairi", "common.submit": "Wasilisha",
    "common.loading": "Inapakia...", "common.error": "Kosa limetokea", "common.success": "Imefanikiwa",
    "nav.dashboard": "Dashibodi", "nav.marketplace": "Soko", "nav.loans": "Mikopo", "nav.delivery": "Usafirishaji",
    "nav.weather": "Hali ya Hewa", "nav.settings": "Mipangilio", "nav.aquaculture": "Ufugaji Samaki", "nav.insurance": "Bima",
    "farmer.profile": "Wasifu wa Mkulima", "farmer.farms": "Mashamba Yangu", "farmer.crops": "Mazao Yangu", "farmer.harvest": "Rekodi za Mavuno",
    "market.sell": "Uza Mazao", "market.buy": "Nunua Mazao", "market.price": "Bei ya Sasa", "market.listings": "Orodha",
    "loan.apply": "Omba Mkopo", "loan.status": "Hali ya Mkopo", "loan.repay": "Lipa Mkopo", "loan.history": "Historia ya Mikopo",
    "delivery.track": "Fuatilia Usafirishaji", "delivery.schedule": "Panga Uchukuzi", "delivery.history": "Historia ya Usafirishaji",
    "weather.forecast": "Utabiri wa Hali ya Hewa", "weather.alerts": "Tahadhari za Hali ya Hewa", "weather.advisory": "Ushauri wa Kilimo",
    "insurance.buy": "Nunua Bima", "insurance.claim": "Dai Bima", "insurance.policies": "Sera Zangu",
    "notification.new_order": "Agizo jipya limepokelewa", "notification.payment": "Malipo yamepokelewa", "notification.delivery": "Sasisho la usafirishaji",
  },
  ha: {
    "common.welcome": "Barka da zuwa FarmConnect",
    "common.login": "Shiga", "common.logout": "Fita", "common.save": "Ajiye", "common.cancel": "Soke", "common.submit": "Aika",
    "common.loading": "Ana lodawa...", "common.error": "Kuskure ya faru", "common.success": "An yi nasara",
    "nav.dashboard": "Allon sarrafa", "nav.marketplace": "Kasuwa", "nav.loans": "Bashi", "nav.delivery": "Isar da kaya",
    "nav.weather": "Yanayi", "nav.settings": "Saituna", "nav.aquaculture": "Kiwo Kifi", "nav.insurance": "Inshora",
    "farmer.profile": "Bayanan Manomi", "farmer.farms": "Gonarki na", "farmer.crops": "Amfanin gona na", "farmer.harvest": "Bayanan girbi",
    "market.sell": "Sayar da amfanin gona", "market.buy": "Saya amfanin gona", "market.price": "Farashin yanzu", "market.listings": "Jerin kaya",
    "loan.apply": "Neman bashi", "loan.status": "Halin bashi", "loan.repay": "Biya bashi", "loan.history": "Tarihin bashi",
    "delivery.track": "Bi diddigin kaya", "delivery.schedule": "Shirya daukar kaya", "delivery.history": "Tarihin isar kaya",
    "weather.forecast": "Hasashen yanayi", "weather.alerts": "Gargadin yanayi", "weather.advisory": "Shawarar noma",
    "insurance.buy": "Sayi inshora", "insurance.claim": "Neman biyan inshora", "insurance.policies": "Inshorar ki",
    "notification.new_order": "Sabon oda an karba", "notification.payment": "An karbi kudi", "notification.delivery": "Sabuntawar isar kaya",
  },
  yo: {
    "common.welcome": "Kaabo si FarmConnect",
    "common.login": "Wọle", "common.logout": "Jade", "common.save": "Fipamọ", "common.cancel": "Fagilee", "common.submit": "Fi silẹ",
    "common.loading": "N'ṣawọle...", "common.error": "Aṣiṣe kan ṣẹlẹ", "common.success": "O ti ṣaṣeyọri",
    "nav.dashboard": "Ibi-iṣakoso", "nav.marketplace": "Ọja", "nav.loans": "Awin", "nav.delivery": "Ifiranṣẹ",
    "nav.weather": "Oju-ọjọ", "nav.settings": "Eto", "nav.aquaculture": "Ẹja Pipa", "nav.insurance": "Iṣeduro",
    "farmer.profile": "Akọọlẹ Agbẹ", "farmer.farms": "Oko Mi", "farmer.crops": "Irugbin Mi", "farmer.harvest": "Igbasilẹ Ikore",
    "market.sell": "Ta Ohun-ọgbin", "market.buy": "Ra Ohun-ọgbin", "market.price": "Iye Lọwọlọwọ", "market.listings": "Atokọ",
    "loan.apply": "Beere Awin", "loan.status": "Ipo Awin", "loan.repay": "San Awin", "loan.history": "Itan Awin",
    "delivery.track": "Tọpa Ifiranṣẹ", "delivery.schedule": "Ṣeto Gbigbe", "delivery.history": "Itan Ifiranṣẹ",
    "weather.forecast": "Asọtẹlẹ Oju-ọjọ", "weather.alerts": "Ikilọ Oju-ọjọ", "weather.advisory": "Imọran Oko",
    "insurance.buy": "Ra Iṣeduro", "insurance.claim": "Beere Ẹtọ", "insurance.policies": "Eto Iṣeduro Mi",
    "notification.new_order": "Aṣẹ titun ti gba", "notification.payment": "Owo ti gba", "notification.delivery": "Imudojuiwọn ifiranṣẹ",
  },
  fr: {
    "common.welcome": "Bienvenue sur FarmConnect",
    "common.login": "Connexion", "common.logout": "Déconnexion", "common.save": "Enregistrer", "common.cancel": "Annuler", "common.submit": "Soumettre",
    "common.loading": "Chargement...", "common.error": "Une erreur est survenue", "common.success": "Succès",
    "nav.dashboard": "Tableau de bord", "nav.marketplace": "Marché", "nav.loans": "Prêts", "nav.delivery": "Livraison",
    "nav.weather": "Météo", "nav.settings": "Paramètres", "nav.aquaculture": "Aquaculture", "nav.insurance": "Assurance",
    "farmer.profile": "Profil Agriculteur", "farmer.farms": "Mes Fermes", "farmer.crops": "Mes Cultures", "farmer.harvest": "Registre des Récoltes",
    "market.sell": "Vendre Produits", "market.buy": "Acheter Produits", "market.price": "Prix Actuel", "market.listings": "Annonces",
    "loan.apply": "Demander un Prêt", "loan.status": "État du Prêt", "loan.repay": "Rembourser", "loan.history": "Historique des Prêts",
    "delivery.track": "Suivre Livraison", "delivery.schedule": "Planifier Collecte", "delivery.history": "Historique Livraisons",
    "weather.forecast": "Prévisions Météo", "weather.alerts": "Alertes Météo", "weather.advisory": "Conseils Agricoles",
    "insurance.buy": "Acheter Assurance", "insurance.claim": "Déclarer Sinistre", "insurance.policies": "Mes Polices",
    "notification.new_order": "Nouvelle commande reçue", "notification.payment": "Paiement reçu", "notification.delivery": "Mise à jour livraison",
  },
  am: {
    "common.welcome": "እንኳን ወደ FarmConnect በደህና መጡ",
    "common.login": "ግባ", "common.logout": "ውጣ", "common.save": "አስቀምጥ", "common.cancel": "ሰርዝ", "common.submit": "አስገባ",
    "common.loading": "በመጫን ላይ...", "common.error": "ስህተት ተፈጥሯል", "common.success": "ተሳክቷል",
    "nav.dashboard": "ዳሽቦርድ", "nav.marketplace": "ገበያ", "nav.loans": "ብድር", "nav.delivery": "ማድረስ",
    "nav.weather": "የአየር ሁኔታ", "nav.settings": "ቅንብሮች", "nav.aquaculture": "ዓሣ ማርባት", "nav.insurance": "ኢንሹራንስ",
    "farmer.profile": "የገበሬ መገለጫ", "farmer.farms": "እርሻዎቼ", "farmer.crops": "ሰብሎቼ", "farmer.harvest": "የምርት መዝገብ",
    "market.sell": "ምርት ሽጥ", "market.buy": "ምርት ግዛ", "market.price": "የአሁን ዋጋ", "market.listings": "ዝርዝሮች",
    "loan.apply": "ብድር ጠይቅ", "loan.status": "የብድር ሁኔታ", "loan.repay": "ብድር ክፈል", "loan.history": "የብድር ታሪክ",
    "delivery.track": "ማድረስ ተከታተል", "delivery.schedule": "ማጓጓዝ አቅድ", "delivery.history": "የማድረስ ታሪክ",
    "weather.forecast": "የአየር ሁኔታ ትንበያ", "weather.alerts": "የአየር ሁኔታ ማስጠንቀቂያ", "weather.advisory": "የእርሻ ምክር",
    "insurance.buy": "ኢንሹራንስ ግዛ", "insurance.claim": "ጥያቄ አቅርብ", "insurance.policies": "ፖሊሲዎቼ",
    "notification.new_order": "አዲስ ትዕዛዝ ተቀብሏል", "notification.payment": "ክፍያ ተቀብሏል", "notification.delivery": "የማድረስ ዝማኔ",
  },
};

export function t(key: string, locale: SupportedLocale = "en"): string {
  return translations[locale]?.[key] || translations.en[key] || key;
}

export function getLocaleBundle(locale: SupportedLocale): Record<string, string> {
  return translations[locale] || translations.en;
}

export function getSupportedLocales(): { code: SupportedLocale; name: string; nativeName: string; rtl: boolean }[] {
  return [
    { code: "en", name: "English", nativeName: "English", rtl: false },
    { code: "sw", name: "Swahili", nativeName: "Kiswahili", rtl: false },
    { code: "ha", name: "Hausa", nativeName: "Hausa", rtl: false },
    { code: "yo", name: "Yoruba", nativeName: "Yorùbá", rtl: false },
    { code: "fr", name: "French", nativeName: "Français", rtl: false },
    { code: "am", name: "Amharic", nativeName: "አማርኛ", rtl: false },
  ];
}

export function detectLocale(acceptLanguage: string): SupportedLocale {
  const supported = ["en", "sw", "ha", "yo", "fr", "am"] as const;
  const parts = acceptLanguage.split(",");
  for (const part of parts) {
    const lang = part.split(";")[0].trim().toLowerCase().slice(0, 2);
    if (supported.includes(lang as any)) return lang as SupportedLocale;
  }
  return "en";
}
