export interface USSDRequest {
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  text: string;
}

export interface USSDResponse {
  text: string;
  continueSession: boolean;
}

export interface USSDSession {
  sessionId: string;
  phoneNumber: string;
  step: string;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum USSDMenuStep {
  MAIN_MENU = "main_menu",
  REGISTER_NAME = "register_name",
  REGISTER_LOCATION = "register_location",
  REGISTER_FARM_SIZE = "register_farm_size",
  REGISTER_CROPS = "register_crops",
  REGISTER_CONFIRM = "register_confirm",
  VIEW_PROFILE = "view_profile",
  UPDATE_PROFILE = "update_profile",
  // Marketplace
  MARKETPLACE_MENU = "marketplace_menu",
  MARKETPLACE_BROWSE = "marketplace_browse",
  MARKETPLACE_BROWSE_CROP = "marketplace_browse_crop",
  MARKETPLACE_BUY_CONFIRM = "marketplace_buy_confirm",
  MARKETPLACE_SELL = "marketplace_sell",
  MARKETPLACE_SELL_CROP = "marketplace_sell_crop",
  MARKETPLACE_SELL_QTY = "marketplace_sell_qty",
  MARKETPLACE_SELL_PRICE = "marketplace_sell_price",
  MARKETPLACE_SELL_CONFIRM = "marketplace_sell_confirm",
  // Price Alerts
  PRICE_ALERTS_MENU = "price_alerts_menu",
  PRICE_ALERT_CROP = "price_alert_crop",
  PRICE_ALERT_THRESHOLD = "price_alert_threshold",
  // Payments
  PAYMENT_MENU = "payment_menu",
  PAYMENT_AMOUNT = "payment_amount",
  PAYMENT_CONFIRM = "payment_confirm",
  // Language
  LANGUAGE_SELECT = "language_select",
}
