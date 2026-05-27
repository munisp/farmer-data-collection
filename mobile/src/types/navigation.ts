import type { NavigatorScreenParams } from '@react-navigation/native';

// Auth Stack
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

// Main Tab Navigator
export type MainTabParamList = {
  Home: undefined;
  Harvests: undefined;
  Expenses: undefined;
  Marketplace: undefined;
  Profile: undefined;
};

// Harvest Stack
export type HarvestStackParamList = {
  HarvestList: undefined;
  HarvestDetail: { id: string };
  HarvestCreate: undefined;
  HarvestEdit: { id: string };
  HarvestCamera: { harvestId?: string };
};

// Expense Stack
export type ExpenseStackParamList = {
  ExpenseList: undefined;
  ExpenseDetail: { id: string };
  ExpenseCreate: undefined;
  ExpenseEdit: { id: string };
  ExpenseCamera: { expenseId?: string };
};

// Marketplace Stack
export type MarketplaceStackParamList = {
  MarketplaceBrowse: undefined;
  MarketplaceDetail: { id: string };
  MarketplaceCart: undefined;
  MarketplaceCheckout: undefined;
  MarketplaceOrders: undefined;
  MarketplaceOrderDetail: { id: string };
};

// Profile Stack
export type ProfileStackParamList = {
  ProfileHome: undefined;
  ProfileEdit: undefined;
  Settings: undefined;
  About: undefined;
};

// Root Navigator
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  MLPredictions: undefined;
  Notifications: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
