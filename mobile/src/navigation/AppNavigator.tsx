import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '@/stores/authStore';
import { Platform, StyleSheet, View, Text } from 'react-native';

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
    </Stack.Navigator>
  );
}

// ===== More Stack (Profile, Settings, Journeys) =====
function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="JourneyList" component={JourneyListScreen} />
      <Stack.Screen name="JourneyDetail" component={JourneyDetailScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#166534',
        tabBarInactiveTintColor: '#9ca3af',
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
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000',
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
    backgroundColor: '#166534',
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
