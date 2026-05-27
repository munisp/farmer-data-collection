/**
 * Multi-language support for the ag-fintech platform
 * Default language: English (en)
 * Supported Nigerian languages: Yoruba (yo), Hausa (ha), Igbo (ig)
 */

export type LanguageCode = 'en' | 'yo' | 'ha' | 'ig';

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export interface LanguageMeta {
  code: LanguageCode;
  name: string;
  nativeName: string;
}

export const languageMeta: Record<LanguageCode, LanguageMeta> = {
  en: { code: 'en', name: 'English', nativeName: 'English' },
  yo: { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá' },
  ha: { code: 'ha', name: 'Hausa', nativeName: 'Hausa' },
  ig: { code: 'ig', name: 'Igbo', nativeName: 'Igbo' },
};

export const resources = {
  en: {
    common: {
      // App
      appName: 'Farm Data Management',
      appTagline: 'Agricultural Finance Platform',
      
      // Navigation sections
      navCore: 'Core',
      navInventory: 'Inventory & Supply',
      navMarketplace: 'Marketplace',
      navExchange: 'Commodity Exchange',
      navFinancial: 'Financial & Microfinance',
      navSpatial: 'Spatial & Weather',
      navAI: 'AI & Analytics',
      navReports: 'Reports & Export',
      navCooperatives: 'Cooperatives & Agents',
      
      // Core navigation items
      dashboard: 'Dashboard',
      quickAddFarmer: 'Quick Add Farmer',
      manageFarmers: 'Manage Farmers',
      farms: 'Farms',
      crops: 'Crops',
      livestock: 'Livestock',
      harvests: 'Harvests',
      expenses: 'Expenses',
      
      // Inventory navigation
      inventoryManagement: 'Inventory Management',
      farmInputs: 'Farm Inputs',
      equipmentTracker: 'Equipment Tracker',
      traceability: 'Traceability',
      
      // Marketplace navigation
      browseMarketplace: 'Browse Marketplace',
      createListing: 'Create Listing',
      myListings: 'My Listings',
      myOrders: 'My Orders',
      mySales: 'My Sales',
      shoppingCart: 'Shopping Cart',
      messages: 'Messages',
      
      // Exchange navigation
      exchangeDashboard: 'Exchange Dashboard',
      myExchangeOrders: 'My Exchange Orders',
      myTrades: 'My Trades',
      
      // Financial navigation
      microfinanceDashboard: 'Microfinance Dashboard',
      applyForLoan: 'Apply for Loan',
      myLoans: 'My Loans',
      myApplications: 'My Applications',
      repaymentTracking: 'Repayment Tracking',
      bankingDashboard: 'Banking Dashboard',
      accounting: 'Accounting',
      creditScore: 'Credit Score',
      loanCalculator: 'Loan Calculator',
      compareLenders: 'Compare Lenders',
      borrowerDashboard: 'Borrower Dashboard',
      
      // Spatial navigation
      farmersMap: 'Farmers Map',
      gpsTracking: 'GPS Tracking',
      satelliteImagery: 'Satellite Imagery',
      spatialAnalytics: 'Spatial Analytics',
      weatherDashboard: 'Weather Dashboard',
      precisionAgriculture: 'Precision Agriculture',
      
      // AI navigation
      analytics: 'Analytics',
      advancedAnalytics: 'Advanced Analytics',
      aiCropDiagnosis: 'AI Crop Diagnosis',
      yieldPrediction: 'Yield Prediction',
      priceForecast: 'Price Forecast',
      agIntelligence: 'Ag Intelligence',
      mlModels: 'ML Models',
      inputYieldAnalytics: 'Input/Yield Analytics',
      
      // Reports navigation
      reports: 'Reports',
      financialReports: 'Financial Reports',
      spatialReports: 'Spatial Reports',
      bulkExport: 'Bulk Export',
      exportScheduler: 'Export Scheduler',
      
      // Cooperatives navigation
      cooperatives: 'Cooperatives',
      fieldAgentDashboard: 'Field Agent Dashboard',
      agentTasks: 'Agent Tasks',
      farmerVerification: 'Farmer Verification',
      
      // Settings
      settings: 'Settings',
      profile: 'Profile',
      logout: 'Logout',
      loggedInAs: 'Logged in as',
      
      // Common actions
      add: 'Add',
      edit: 'Edit',
      delete: 'Delete',
      save: 'Save',
      cancel: 'Cancel',
      submit: 'Submit',
      search: 'Search',
      filter: 'Filter',
      apply: 'Apply',
      clear: 'Clear',
      viewDetails: 'View Details',
      addToCart: 'Add to Cart',
      checkout: 'Checkout',
      
      // Common labels
      total: 'Total',
      quantity: 'Quantity',
      price: 'Price',
      status: 'Status',
      date: 'Date',
      name: 'Name',
      description: 'Description',
      category: 'Category',
      location: 'Location',
      
      // Status labels
      active: 'Active',
      inactive: 'Inactive',
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      completed: 'Completed',
      
      // Currency
      currency: 'Currency',
      selectCurrency: 'Select Currency',
      
      // Language
      language: 'Language',
      selectLanguage: 'Select Language',
      
      // Dashboard
      keyMetrics: 'Key Metrics',
      totalFarmers: 'Total Farmers',
      totalFarms: 'Total Farms',
      totalCrops: 'Total Crops',
      totalLivestock: 'Total Livestock',
      totalHarvests: 'Total Harvests',
      totalExpenses: 'Total Expenses',
      financialOverview: 'Financial Overview',
      totalRevenue: 'Total Revenue',
      netProfit: 'Net Profit',
      
      // Inventory
      totalItems: 'Total Items',
      inventoryValue: 'Inventory Value',
      lowStock: 'Low Stock',
      activeSuppliers: 'Active Suppliers',
      suppliers: 'Suppliers',
      transactions: 'Transactions',
      
      // Marketplace
      products: 'Products',
      organic: 'Organic',
      available: 'Available',
      seller: 'Seller',
      deliveryOptions: 'Delivery Options',
      farmPickup: 'Farm Pickup',
      localDelivery: 'Local Delivery',
      shipping: 'Shipping',
    },
  },
  yo: {
    common: {
      // App
      appName: 'Ìṣàkóso Dátà Oko',
      appTagline: 'Pẹpẹ Ìṣúná Ogbin',
      
      // Navigation sections
      navCore: 'Pàtàkì',
      navInventory: 'Ohun Ìní & Ìpèsè',
      navMarketplace: 'Ọjà',
      navExchange: 'Pàṣípààrọ̀ Ọjà',
      navFinancial: 'Ìṣúná & Owó Kékeré',
      navSpatial: 'Àyè & Ojú Ọjọ́',
      navAI: 'AI & Ìtúpalẹ̀',
      navReports: 'Ìròyìn & Ìkójáde',
      navCooperatives: 'Ẹgbẹ́ & Aṣojú',
      
      // Core navigation items
      dashboard: 'Dasibodu',
      quickAddFarmer: 'Fi Àgbẹ̀ Kún Yára',
      manageFarmers: 'Ṣàkóso Àwọn Àgbẹ̀',
      farms: 'Àwọn Oko',
      crops: 'Àwọn Irúgbìn',
      livestock: 'Ẹran Ọ̀sìn',
      harvests: 'Àwọn Ìkórè',
      expenses: 'Àwọn Ìnáwó',
      
      // Inventory navigation
      inventoryManagement: 'Ìṣàkóso Ohun Ìní',
      farmInputs: 'Àwọn Ohun Èlò Oko',
      equipmentTracker: 'Àtẹ̀lé Ẹ̀rọ',
      traceability: 'Ìtọpinpin',
      
      // Marketplace navigation
      browseMarketplace: 'Wo Ọjà',
      createListing: 'Ṣẹ̀dá Àkójọ',
      myListings: 'Àwọn Àkójọ Mi',
      myOrders: 'Àwọn Àṣẹ Mi',
      mySales: 'Àwọn Títà Mi',
      shoppingCart: 'Àpótí Rírà',
      messages: 'Àwọn Ìfiránṣẹ́',
      
      // Exchange navigation
      exchangeDashboard: 'Dasibodu Pàṣípààrọ̀',
      myExchangeOrders: 'Àwọn Àṣẹ Pàṣípààrọ̀ Mi',
      myTrades: 'Àwọn Òwò Mi',
      
      // Financial navigation
      microfinanceDashboard: 'Dasibodu Owó Kékeré',
      applyForLoan: 'Béèrè fún Àwín',
      myLoans: 'Àwọn Àwín Mi',
      myApplications: 'Àwọn Ìbéèrè Mi',
      repaymentTracking: 'Àtẹ̀lé Ìsanpadà',
      bankingDashboard: 'Dasibodu Ilé-ìfowópamọ́',
      accounting: 'Ìṣirò',
      creditScore: 'Ìwọ̀n Gbèsè',
      loanCalculator: 'Ẹ̀rọ Ìṣirò Àwín',
      compareLenders: 'Ṣe Àfiwé Àwọn Olùyàwín',
      borrowerDashboard: 'Dasibodu Olùyàwín',
      
      // Spatial navigation
      farmersMap: 'Mápù Àwọn Àgbẹ̀',
      gpsTracking: 'Àtẹ̀lé GPS',
      satelliteImagery: 'Àwòrán Satẹlaiti',
      spatialAnalytics: 'Ìtúpalẹ̀ Àyè',
      weatherDashboard: 'Dasibodu Ojú Ọjọ́',
      precisionAgriculture: 'Ogbin Pípé',
      
      // AI navigation
      analytics: 'Ìtúpalẹ̀',
      advancedAnalytics: 'Ìtúpalẹ̀ Gíga',
      aiCropDiagnosis: 'Àyẹ̀wò Irúgbìn AI',
      yieldPrediction: 'Àsọtẹ́lẹ̀ Èso',
      priceForecast: 'Àsọtẹ́lẹ̀ Owó',
      agIntelligence: 'Ìmọ̀ Ogbin',
      mlModels: 'Àwọn Àwòṣe ML',
      inputYieldAnalytics: 'Ìtúpalẹ̀ Ohun Èlò/Èso',
      
      // Reports navigation
      reports: 'Àwọn Ìròyìn',
      financialReports: 'Ìròyìn Ìṣúná',
      spatialReports: 'Ìròyìn Àyè',
      bulkExport: 'Ìkójáde Púpọ̀',
      exportScheduler: 'Àtò Ìkójáde',
      
      // Cooperatives navigation
      cooperatives: 'Àwọn Ẹgbẹ́',
      fieldAgentDashboard: 'Dasibodu Aṣojú Pápá',
      agentTasks: 'Àwọn Iṣẹ́ Aṣojú',
      farmerVerification: 'Ìjẹ́rìísí Àgbẹ̀',
      
      // Settings
      settings: 'Àwọn Ètò',
      profile: 'Profaili',
      logout: 'Jáde',
      loggedInAs: 'Wọlé gẹ́gẹ́ bí',
      
      // Common actions
      add: 'Fi Kún',
      edit: 'Ṣàtúnṣe',
      delete: 'Pa rẹ́',
      save: 'Fipamọ́',
      cancel: 'Fagilé',
      submit: 'Fíránṣẹ́',
      search: 'Wá',
      filter: 'Ṣàyọ',
      apply: 'Lo',
      clear: 'Pa rẹ́',
      viewDetails: 'Wo Àlàyé',
      addToCart: 'Fi Sí Àpótí',
      checkout: 'Sanwó',
      
      // Common labels
      total: 'Àpapọ̀',
      quantity: 'Iye',
      price: 'Owó',
      status: 'Ipò',
      date: 'Ọjọ́',
      name: 'Orúkọ',
      description: 'Àpèjúwe',
      category: 'Ẹ̀ka',
      location: 'Ibi',
      
      // Status labels
      active: 'Ṣíṣẹ́',
      inactive: 'Kò Ṣíṣẹ́',
      pending: 'Ń Dúró',
      approved: 'Fọwọ́sí',
      rejected: 'Kọ̀',
      completed: 'Parí',
      
      // Currency
      currency: 'Owó',
      selectCurrency: 'Yan Owó',
      
      // Language
      language: 'Èdè',
      selectLanguage: 'Yan Èdè',
      
      // Dashboard
      keyMetrics: 'Àwọn Ìwọ̀n Pàtàkì',
      totalFarmers: 'Àpapọ̀ Àwọn Àgbẹ̀',
      totalFarms: 'Àpapọ̀ Àwọn Oko',
      totalCrops: 'Àpapọ̀ Àwọn Irúgbìn',
      totalLivestock: 'Àpapọ̀ Ẹran Ọ̀sìn',
      totalHarvests: 'Àpapọ̀ Àwọn Ìkórè',
      totalExpenses: 'Àpapọ̀ Àwọn Ìnáwó',
      financialOverview: 'Àkópọ̀ Ìṣúná',
      totalRevenue: 'Àpapọ̀ Owó Tí Ó Wọlé',
      netProfit: 'Èrè Mímọ́',
      
      // Inventory
      totalItems: 'Àpapọ̀ Àwọn Ohun',
      inventoryValue: 'Iye Ohun Ìní',
      lowStock: 'Ohun Ìní Kékeré',
      activeSuppliers: 'Àwọn Olùpèsè Tí Ń Ṣiṣẹ́',
      suppliers: 'Àwọn Olùpèsè',
      transactions: 'Àwọn Ìdúnàádúrà',
      
      // Marketplace
      products: 'Àwọn Ọjà',
      organic: 'Àdánidá',
      available: 'Wà',
      seller: 'Olùtà',
      deliveryOptions: 'Àwọn Ọ̀nà Ìfijíṣẹ́',
      farmPickup: 'Gbà Ní Oko',
      localDelivery: 'Ìfijíṣẹ́ Àdúgbò',
      shipping: 'Ìfiránṣẹ́',
    },
  },
  ha: {
    common: {
      // App
      appName: 'Gudanar da Bayanan Gona',
      appTagline: 'Dandalin Kuɗin Noma',
      
      // Navigation sections
      navCore: 'Tushe',
      navInventory: 'Kaya & Samarwa',
      navMarketplace: 'Kasuwa',
      navExchange: 'Musayar Kaya',
      navFinancial: 'Kuɗi & Ƙaramin Kuɗi',
      navSpatial: 'Wuri & Yanayi',
      navAI: 'AI & Nazari',
      navReports: 'Rahotanni & Fitarwa',
      navCooperatives: 'Ƙungiyoyi & Wakili',
      
      // Core navigation items
      dashboard: 'Allon Kulawa',
      quickAddFarmer: 'Ƙara Manomi Da Sauri',
      manageFarmers: 'Gudanar da Manoma',
      farms: 'Gonaki',
      crops: 'Amfanin Gona',
      livestock: 'Dabbobi',
      harvests: 'Girbi',
      expenses: 'Kashe Kuɗi',
      
      // Inventory navigation
      inventoryManagement: 'Gudanar da Kaya',
      farmInputs: 'Kayan Aikin Gona',
      equipmentTracker: 'Bin Diddigin Kayan Aiki',
      traceability: 'Bin Diddigi',
      
      // Marketplace navigation
      browseMarketplace: 'Duba Kasuwa',
      createListing: 'Ƙirƙiri Jeri',
      myListings: 'Jeraina',
      myOrders: 'Odaraina',
      mySales: 'Sayarwata',
      shoppingCart: 'Kwandon Sayayya',
      messages: 'Saƙonni',
      
      // Exchange navigation
      exchangeDashboard: 'Allon Musayar',
      myExchangeOrders: 'Odarar Musayar',
      myTrades: 'Cinikayyata',
      
      // Financial navigation
      microfinanceDashboard: 'Allon Ƙaramin Kuɗi',
      applyForLoan: 'Nemi Rance',
      myLoans: 'Rancena',
      myApplications: 'Aikace-aikacena',
      repaymentTracking: 'Bin Diddigin Biya',
      bankingDashboard: 'Allon Banki',
      accounting: 'Lissafi',
      creditScore: 'Maki na Bashi',
      loanCalculator: 'Na\'urar Lissafin Rance',
      compareLenders: 'Kwatanta Masu Ba da Rance',
      borrowerDashboard: 'Allon Mai Rance',
      
      // Spatial navigation
      farmersMap: 'Taswirar Manoma',
      gpsTracking: 'Bin Diddigin GPS',
      satelliteImagery: 'Hotunan Tauraron Dan Adam',
      spatialAnalytics: 'Nazarin Wuri',
      weatherDashboard: 'Allon Yanayi',
      precisionAgriculture: 'Noma Mai Inganci',
      
      // AI navigation
      analytics: 'Nazari',
      advancedAnalytics: 'Nazari Mai Zurfi',
      aiCropDiagnosis: 'Binciken Amfanin Gona na AI',
      yieldPrediction: 'Hasashen Amfani',
      priceForecast: 'Hasashen Farashi',
      agIntelligence: 'Ilimin Noma',
      mlModels: 'Samfuran ML',
      inputYieldAnalytics: 'Nazarin Shigarwa/Amfani',
      
      // Reports navigation
      reports: 'Rahotanni',
      financialReports: 'Rahotannin Kuɗi',
      spatialReports: 'Rahotannin Wuri',
      bulkExport: 'Fitarwa Mai Yawa',
      exportScheduler: 'Jadawalin Fitarwa',
      
      // Cooperatives navigation
      cooperatives: 'Ƙungiyoyi',
      fieldAgentDashboard: 'Allon Wakilin Filin',
      agentTasks: 'Ayyukan Wakili',
      farmerVerification: 'Tabbatar da Manomi',
      
      // Settings
      settings: 'Saituna',
      profile: 'Bayani',
      logout: 'Fita',
      loggedInAs: 'An shiga a matsayin',
      
      // Common actions
      add: 'Ƙara',
      edit: 'Gyara',
      delete: 'Share',
      save: 'Ajiye',
      cancel: 'Soke',
      submit: 'Aika',
      search: 'Bincika',
      filter: 'Tace',
      apply: 'Yi amfani',
      clear: 'Share',
      viewDetails: 'Duba Cikakkun Bayanai',
      addToCart: 'Ƙara zuwa Kwando',
      checkout: 'Biya',
      
      // Common labels
      total: 'Jimla',
      quantity: 'Adadi',
      price: 'Farashi',
      status: 'Matsayi',
      date: 'Kwanan wata',
      name: 'Suna',
      description: 'Bayani',
      category: 'Rukuni',
      location: 'Wuri',
      
      // Status labels
      active: 'Mai aiki',
      inactive: 'Ba mai aiki ba',
      pending: 'Ana jira',
      approved: 'An amince',
      rejected: 'An ƙi',
      completed: 'An kammala',
      
      // Currency
      currency: 'Kuɗi',
      selectCurrency: 'Zaɓi Kuɗi',
      
      // Language
      language: 'Harshe',
      selectLanguage: 'Zaɓi Harshe',
      
      // Dashboard
      keyMetrics: 'Mahimman Ma\'aunai',
      totalFarmers: 'Jimlar Manoma',
      totalFarms: 'Jimlar Gonaki',
      totalCrops: 'Jimlar Amfanin Gona',
      totalLivestock: 'Jimlar Dabbobi',
      totalHarvests: 'Jimlar Girbi',
      totalExpenses: 'Jimlar Kashe Kuɗi',
      financialOverview: 'Taƙaitaccen Kuɗi',
      totalRevenue: 'Jimlar Samun Kuɗi',
      netProfit: 'Riba Mai Tsabta',
      
      // Inventory
      totalItems: 'Jimlar Kaya',
      inventoryValue: 'Darajar Kaya',
      lowStock: 'Ƙarancin Kaya',
      activeSuppliers: 'Masu Samarwa Masu Aiki',
      suppliers: 'Masu Samarwa',
      transactions: 'Ma\'amaloli',
      
      // Marketplace
      products: 'Kayayyaki',
      organic: 'Na Halitta',
      available: 'Akwai',
      seller: 'Mai Sayarwa',
      deliveryOptions: 'Zaɓuɓɓukan Isarwa',
      farmPickup: 'Ɗauka Daga Gona',
      localDelivery: 'Isarwa Ta Gida',
      shipping: 'Aikawa',
    },
  },
  ig: {
    common: {
      // App
      appName: 'Njikwa Data Ugbo',
      appTagline: 'Ikpo Ego Ọrụ Ugbo',
      
      // Navigation sections
      navCore: 'Isi',
      navInventory: 'Ngwa & Nnyefe',
      navMarketplace: 'Ahịa',
      navExchange: 'Mgbanwe Ngwa',
      navFinancial: 'Ego & Ego Nta',
      navSpatial: 'Ebe & Ihu Igwe',
      navAI: 'AI & Nyocha',
      navReports: 'Akụkọ & Mbupụ',
      navCooperatives: 'Otu & Onye Nnọchi',
      
      // Core navigation items
      dashboard: 'Dashibọọdụ',
      quickAddFarmer: 'Tinye Onye Ọrụ Ugbo Ngwa Ngwa',
      manageFarmers: 'Jikwaa Ndị Ọrụ Ugbo',
      farms: 'Ugbo',
      crops: 'Ihe Ọkụkụ',
      livestock: 'Anụ Ụlọ',
      harvests: 'Owuwe Ihe Ubi',
      expenses: 'Mmefu',
      
      // Inventory navigation
      inventoryManagement: 'Njikwa Ngwa',
      farmInputs: 'Ngwa Ọrụ Ugbo',
      equipmentTracker: 'Nsochi Ngwa Ọrụ',
      traceability: 'Nsochi',
      
      // Marketplace navigation
      browseMarketplace: 'Lelee Ahịa',
      createListing: 'Mepụta Ndepụta',
      myListings: 'Ndepụta M',
      myOrders: 'Iwu M',
      mySales: 'Ire M',
      shoppingCart: 'Ngwongwo Azụmahịa',
      messages: 'Ozi',
      
      // Exchange navigation
      exchangeDashboard: 'Dashibọọdụ Mgbanwe',
      myExchangeOrders: 'Iwu Mgbanwe M',
      myTrades: 'Azụmahịa M',
      
      // Financial navigation
      microfinanceDashboard: 'Dashibọọdụ Ego Nta',
      applyForLoan: 'Rịọ Ego Mbinye',
      myLoans: 'Ego Mbinye M',
      myApplications: 'Arịrịọ M',
      repaymentTracking: 'Nsochi Nkwụghachi',
      bankingDashboard: 'Dashibọọdụ Ụlọ Akụ',
      accounting: 'Ọgụgụ Ego',
      creditScore: 'Akara Kredit',
      loanCalculator: 'Ngụkọta Ego Mbinye',
      compareLenders: 'Tụlee Ndị Na-enye Ego',
      borrowerDashboard: 'Dashibọọdụ Onye Gbara Ego',
      
      // Spatial navigation
      farmersMap: 'Maapụ Ndị Ọrụ Ugbo',
      gpsTracking: 'Nsochi GPS',
      satelliteImagery: 'Foto Satịlaịtị',
      spatialAnalytics: 'Nyocha Ebe',
      weatherDashboard: 'Dashibọọdụ Ihu Igwe',
      precisionAgriculture: 'Ọrụ Ugbo Nke Ọma',
      
      // AI navigation
      analytics: 'Nyocha',
      advancedAnalytics: 'Nyocha Dị Elu',
      aiCropDiagnosis: 'Nyocha Ihe Ọkụkụ AI',
      yieldPrediction: 'Amụma Mkpụrụ',
      priceForecast: 'Amụma Ọnụ Ahịa',
      agIntelligence: 'Amamihe Ọrụ Ugbo',
      mlModels: 'Ụdị ML',
      inputYieldAnalytics: 'Nyocha Ntinye/Mkpụrụ',
      
      // Reports navigation
      reports: 'Akụkọ',
      financialReports: 'Akụkọ Ego',
      spatialReports: 'Akụkọ Ebe',
      bulkExport: 'Mbupụ Ukwu',
      exportScheduler: 'Nhazi Mbupụ',
      
      // Cooperatives navigation
      cooperatives: 'Otu',
      fieldAgentDashboard: 'Dashibọọdụ Onye Nnọchi',
      agentTasks: 'Ọrụ Onye Nnọchi',
      farmerVerification: 'Nyocha Onye Ọrụ Ugbo',
      
      // Settings
      settings: 'Ntọala',
      profile: 'Profaịlụ',
      logout: 'Pụọ',
      loggedInAs: 'Banye dị ka',
      
      // Common actions
      add: 'Tinye',
      edit: 'Dezie',
      delete: 'Hichapụ',
      save: 'Chekwaa',
      cancel: 'Kagbuo',
      submit: 'Nyefee',
      search: 'Chọọ',
      filter: 'Họrọ',
      apply: 'Tinye',
      clear: 'Hichapụ',
      viewDetails: 'Lee Nkọwa',
      addToCart: 'Tinye na Ngwongwo',
      checkout: 'Kwụọ Ụgwọ',
      
      // Common labels
      total: 'Niile',
      quantity: 'Ọnụ Ọgụgụ',
      price: 'Ọnụ Ahịa',
      status: 'Ọnọdụ',
      date: 'Ụbọchị',
      name: 'Aha',
      description: 'Nkọwa',
      category: 'Ụdị',
      location: 'Ebe',
      
      // Status labels
      active: 'Na-arụ ọrụ',
      inactive: 'Anaghị arụ ọrụ',
      pending: 'Na-eche',
      approved: 'Kwadoro',
      rejected: 'Jụrụ',
      completed: 'Emechara',
      
      // Currency
      currency: 'Ego',
      selectCurrency: 'Họrọ Ego',
      
      // Language
      language: 'Asụsụ',
      selectLanguage: 'Họrọ Asụsụ',
      
      // Dashboard
      keyMetrics: 'Ihe Nlele Isi',
      totalFarmers: 'Ndị Ọrụ Ugbo Niile',
      totalFarms: 'Ugbo Niile',
      totalCrops: 'Ihe Ọkụkụ Niile',
      totalLivestock: 'Anụ Ụlọ Niile',
      totalHarvests: 'Owuwe Ihe Ubi Niile',
      totalExpenses: 'Mmefu Niile',
      financialOverview: 'Nchịkọta Ego',
      totalRevenue: 'Ego Nwetara Niile',
      netProfit: 'Uru Dị Ọcha',
      
      // Inventory
      totalItems: 'Ihe Niile',
      inventoryValue: 'Uru Ngwa',
      lowStock: 'Ngwa Dị Ala',
      activeSuppliers: 'Ndị Na-enye Na-arụ Ọrụ',
      suppliers: 'Ndị Na-enye',
      transactions: 'Azụmahịa',
      
      // Marketplace
      products: 'Ngwa Ahịa',
      organic: 'Nke Ọdịnala',
      available: 'Dị',
      seller: 'Onye Na-ere',
      deliveryOptions: 'Nhọrọ Nnyefe',
      farmPickup: 'Were na Ugbo',
      localDelivery: 'Nnyefe Mpaghara',
      shipping: 'Nzipu',
    },
  },
} as const;

export function getSupportedLanguages(): LanguageMeta[] {
  return Object.values(languageMeta);
}
