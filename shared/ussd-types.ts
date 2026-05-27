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
}
