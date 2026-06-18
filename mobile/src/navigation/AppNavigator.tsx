import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '@/stores/authStore';
import { Platform, StyleSheet, View, Text, useColorScheme } from 'react-native';
import { colors, darkColors } from '@/lib/theme';

// Type-safe navigation param lists
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type FarmStackParamList = {
  HarvestList: undefined;
  HarvestDetail: { id: number };
  HarvestCreate: undefined;
  HarvestEdit: { id: number };
  ExpenseList: undefined;
  ExpenseDetail: { id: number };
  ExpenseCreate: undefined;
  ExpenseEdit: { id: number };
  YieldPrediction: undefined;
  PriceForecast: undefined;
  FarmRegistration: undefined;
  CropDashboard: undefined;
  CropWizard: undefined;
  DroneControl: undefined;
  EquipmentFleet: undefined;
  SoilAnalysis: undefined;
  AIChatAdvisor: undefined;
  CarbonCredits: undefined;
  Traceability: undefined;
  IoTDashboard: undefined;
  Aquaculture: undefined;
  PrecisionAg: undefined;
  DroneFlights: undefined;
  DairyDashboard: undefined;
};

export type MarketStackParamList = {
  MarketplaceBrowse: undefined;
  MarketplaceDetail: { id: number };
  Cart: undefined;
  Checkout: undefined;
  Orders: undefined;
  PhotoInventory: undefined;
  DeliveryTracking: undefined;
  DistributorNetwork: undefined;
  DistributorMap: undefined;
  ColdChain: undefined;
  SupplyChain: undefined;
};

export type FinanceStackParamList = {
  FarmerRegistration: undefined;
  FarmerProfile: { id?: number };
  LoanApplication: undefined;
  MobileMoney: undefined;
  Cooperative: undefined;
  Chama: undefined;
  Exchange: undefined;
  Insurance: undefined;
  Escrow: undefined;
  Collections: undefined;
};

export type MoreStackParamList = {
  Profile: undefined;
  Settings: undefined;
  BiometricSettings: undefined;
  JourneyList: undefined;
  JourneyDetail: { id: number };
  JourneyTracker: undefined;
  Analytics: undefined;
  AdminDashboard: undefined;
  WorkflowList: undefined;
  WorkflowDetail: { id: number };
  Weather: undefined;
  VoiceAdvisor: undefined;
  CreditScore: undefined;
};

export type RootTabParamList = {
  Home: undefined;
  Farm: undefined;
  Market: undefined;
  Finance: undefined;
  More: undefined;
};

// Auth screens
import LoginScreen from '@/screens/auth/LoginScreen';
import RegisterScreen from '@/screens/auth/RegisterScreen';

// Main screens
import HomeScreen from '@/screens/HomeScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';
import SettingsScreen from '@/screens/profile/SettingsScreen';

// Harvest screens
import HarvestListScreen from '@/screens/harvests/HarvestListScreen';
import HarvestDetailScreen from '@/screens/harvests/HarvestDetailScreen';
import HarvestCreateScreen from '@/screens/harvests/HarvestCreateScreen';
import HarvestEditScreen from '@/screens/harvests/HarvestEditScreen';

// Expense screens
import ExpenseListScreen from '@/screens/expenses/ExpenseListScreen';
import ExpenseDetailScreen from '@/screens/expenses/ExpenseDetailScreen';
import ExpenseCreateScreen from '@/screens/expenses/ExpenseCreateScreen';
import ExpenseEditScreen from '@/screens/expenses/ExpenseEditScreen';

// Marketplace screens
import MarketplaceBrowseScreen from '@/screens/marketplace/MarketplaceBrowseScreen';
import MarketplaceDetailScreen from '@/screens/marketplace/MarketplaceDetailScreen';
import CartScreen from '@/screens/marketplace/CartScreen';
import CheckoutScreen from '@/screens/marketplace/CheckoutScreen';
import OrdersScreen from '@/screens/marketplace/OrdersScreen';

// ML screens
import YieldPredictionScreen from '@/screens/ml/YieldPredictionScreen';
import PriceForecastScreen from '@/screens/ml/PriceForecastScreen';

// Farmer screens
import FarmerRegistrationScreen from '@/screens/farmers/FarmerRegistrationScreen';
import FarmerProfileScreen from '@/screens/farmers/FarmerProfileScreen';

// Farm screens
import FarmRegistrationScreen from '@/screens/farms/FarmRegistrationScreen';

// Loan screens
import LoanApplicationScreen from '@/screens/loans/LoanApplicationScreen';

// Journey screens
import JourneyListScreen from '@/screens/journeys/JourneyListScreen';
import JourneyDetailScreen from '@/screens/journeys/JourneyDetailScreen';
import JourneyTrackerScreen from '@/screens/journeys/JourneyTrackerScreen';

// AI screens
import AIChatScreen from '@/screens/ai/AIChatScreen';

// Crop screens
import CropDashboardScreen from '@/screens/crops/CropDashboardScreen';
import CropWizardScreen from '@/screens/crops/CropWizardScreen';

// Equipment screens
import DroneControlScreen from '@/screens/equipment/DroneControlScreen';
import EquipmentFleetScreen from '@/screens/equipment/EquipmentFleetScreen';

// Delivery screens
import DeliveryTrackingScreen from '@/screens/delivery/DeliveryTrackingScreen';

// Payment screens
import MobileMoneyScreen from '@/screens/payments/MobileMoneyScreen';

// Cooperative & Chama screens
import CooperativeManagement from '@/screens/cooperative/CooperativeManagement';
import ChamaScreen from '@/screens/chama/ChamaScreen';

// Carbon & Soil screens
import CarbonCredits from '@/screens/carbon/CarbonCredits';
import SoilAnalysisScreen from '@/screens/soil/SoilAnalysisScreen';

// Traceability & Analytics screens
import TraceabilityDashboard from '@/screens/traceability/TraceabilityDashboard';
import AnalyticsDashboard from '@/screens/analytics/AnalyticsDashboard';

// New feature screens
import DistributorNetworkScreen from '@/screens/distributor/DistributorNetworkScreen';
import DistributorMapScreen from '@/screens/maps/DistributorMapScreen';
import ExchangeScreen from '@/screens/exchange/ExchangeScreen';
import InsuranceScreen from '@/screens/insurance/InsuranceScreen';
import CollectionsScreen from '@/screens/finance/CollectionsScreen';
import EscrowScreen from '@/screens/finance/EscrowScreen';
import VoiceAdvisorScreen from '@/screens/ai/VoiceAdvisorScreen';
import WeatherScreen from '@/screens/analytics/WeatherScreen';
import ColdChainScreen from '@/screens/analytics/ColdChainScreen';
import IoTDashboardScreen from '@/screens/iot/IoTDashboardScreen';
import AquacultureScreen from '@/screens/aquaculture/AquacultureScreen';
import PrecisionAgScreen from '@/screens/analytics/PrecisionAgScreen';
import DroneFlightScreen from '@/screens/analytics/DroneFlightScreen';
import SupplyChainScreen from '@/screens/supply-chain/SupplyChainScreen';
import CreditScoreScreen from '@/screens/credit/CreditScoreScreen';

// Dairy screens
import DairyDashboardScreen from '@/screens/dairy/DairyDashboardScreen';

// Admin screens
import AdminDashboardScreen from '@/screens/admin/AdminDashboardScreen';
import WorkflowListScreen from '@/screens/admin/WorkflowListScreen';
import WorkflowDetailScreen from '@/screens/admin/WorkflowDetailScreen';

// Marketplace extra screens
import PhotoInventoryScreen from '@/screens/marketplace/PhotoInventoryScreen';

// Settings screens
import BiometricSettingsScreen from '@/screens/settings/BiometricSettingsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

// Tab icon component
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: '\u{1F3E0}',
    Farm: '\u{1F33E}',
    Market: '\u{1F6D2}',
    Finance: '\u{1F4B0}',
    More: '\u{2699}',
  };
  return (
    <View style={styles.tabIconContainer}>
      {focused && <View style={styles.tabIndicator} />}
      <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>{icons[name] ?? '\u{2699}'}</Text>
    </View>
  );
}

// ===== Farm Stack (Crops, Livestock, Equipment, AI) =====
function FarmStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HarvestList" component={HarvestListScreen} />
      <Stack.Screen name="HarvestDetail" component={HarvestDetailScreen} />
      <Stack.Screen name="HarvestCreate" component={HarvestCreateScreen} />
      <Stack.Screen name="HarvestEdit" component={HarvestEditScreen} />
      <Stack.Screen name="ExpenseList" component={ExpenseListScreen} />
      <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} />
      <Stack.Screen name="ExpenseCreate" component={ExpenseCreateScreen} />
      <Stack.Screen name="ExpenseEdit" component={ExpenseEditScreen} />
      <Stack.Screen name="YieldPrediction" component={YieldPredictionScreen} />
      <Stack.Screen name="PriceForecast" component={PriceForecastScreen} />
      <Stack.Screen name="FarmRegistration" component={FarmRegistrationScreen} />
      <Stack.Screen name="CropDashboard" component={CropDashboardScreen} />
      <Stack.Screen name="CropWizard" component={CropWizardScreen} />
      <Stack.Screen name="DroneControl" component={DroneControlScreen} />
      <Stack.Screen name="EquipmentFleet" component={EquipmentFleetScreen} />
      <Stack.Screen name="SoilAnalysis" component={SoilAnalysisScreen} />
      <Stack.Screen name="AIChatAdvisor" component={AIChatScreen} />
      <Stack.Screen name="CarbonCredits" component={CarbonCredits} />
      <Stack.Screen name="Traceability" component={TraceabilityDashboard} />
      <Stack.Screen name="IoTDashboard" component={IoTDashboardScreen} />
      <Stack.Screen name="Aquaculture" component={AquacultureScreen} />
      <Stack.Screen name="PrecisionAg" component={PrecisionAgScreen} />
      <Stack.Screen name="DroneFlights" component={DroneFlightScreen} />
      <Stack.Screen name="DairyDashboard" component={DairyDashboardScreen} />
    </Stack.Navigator>
  );
}

// ===== Market Stack (Browse, Cart, Orders) =====
function MarketStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MarketplaceBrowse" component={MarketplaceBrowseScreen} />
      <Stack.Screen name="MarketplaceDetail" component={MarketplaceDetailScreen} />
      <Stack.Screen name="Cart" component={CartScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="PhotoInventory" component={PhotoInventoryScreen} />
      <Stack.Screen name="DeliveryTracking" component={DeliveryTrackingScreen} />
      <Stack.Screen name="DistributorNetwork" component={DistributorNetworkScreen} />
      <Stack.Screen name="DistributorMap" component={DistributorMapScreen} />
      <Stack.Screen name="ColdChain" component={ColdChainScreen} />
      <Stack.Screen name="SupplyChain" component={SupplyChainScreen} />
    </Stack.Navigator>
  );
}

// ===== Finance Stack (Loans, Payments) =====
function FinanceStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FarmerRegistration" component={FarmerRegistrationScreen} />
      <Stack.Screen name="FarmerProfile" component={FarmerProfileScreen} />
      <Stack.Screen name="LoanApplication" component={LoanApplicationScreen} />
      <Stack.Screen name="MobileMoney" component={MobileMoneyScreen} />
      <Stack.Screen name="Cooperative" component={CooperativeManagement} />
      <Stack.Screen name="Chama" component={ChamaScreen} />
      <Stack.Screen name="Exchange" component={ExchangeScreen} />
      <Stack.Screen name="Insurance" component={InsuranceScreen} />
      <Stack.Screen name="Escrow" component={EscrowScreen} />
      <Stack.Screen name="Collections" component={CollectionsScreen} />
    </Stack.Navigator>
  );
}

// ===== More Stack (Profile, Settings, Journeys, Admin, Analytics) =====
function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="BiometricSettings" component={BiometricSettingsScreen} />
      <Stack.Screen name="JourneyList" component={JourneyListScreen} />
      <Stack.Screen name="JourneyDetail" component={JourneyDetailScreen} />
      <Stack.Screen name="JourneyTracker" component={JourneyTrackerScreen} />
      <Stack.Screen name="Analytics" component={AnalyticsDashboard} />
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="WorkflowList" component={WorkflowListScreen} />
      <Stack.Screen name="WorkflowDetail" component={WorkflowDetailScreen} />
      <Stack.Screen name="Weather" component={WeatherScreen} />
      <Stack.Screen name="VoiceAdvisor" component={VoiceAdvisorScreen} />
      <Stack.Screen name="CreditScore" component={CreditScoreScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          isDark && {
            backgroundColor: darkColors.background,
            borderTopColor: darkColors.border,
          },
        ],
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: isDark ? darkColors.textMuted : colors.gray400,
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Farm"
        component={FarmStack}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Farm" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Market"
        component={MarketStack}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Market" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Finance"
        component={FinanceStack}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="Finance" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreStack}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="More" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tabIconContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: -10,
    width: 24,
    height: 2,
    backgroundColor: colors.primaryDark,
    borderRadius: 1,
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.6,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
});

export default function AppNavigator() {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <MainTabs /> : <AuthStack />;
}
