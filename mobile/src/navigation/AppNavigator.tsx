import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '@/stores/authStore';

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

function HarvestStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HarvestList" component={HarvestListScreen} />
      <Stack.Screen name="HarvestDetail" component={HarvestDetailScreen} />
      <Stack.Screen name="HarvestCreate" component={HarvestCreateScreen} />
      <Stack.Screen name="HarvestEdit" component={HarvestEditScreen} />
    </Stack.Navigator>
  );
}

function ExpenseStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ExpenseList" component={ExpenseListScreen} />
      <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} />
      <Stack.Screen name="ExpenseCreate" component={ExpenseCreateScreen} />
      <Stack.Screen name="ExpenseEdit" component={ExpenseEditScreen} />
    </Stack.Navigator>
  );
}

function MarketplaceStack() {
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

function MLStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="YieldPrediction" component={YieldPredictionScreen} />
      <Stack.Screen name="PriceForecast" component={PriceForecastScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function FarmersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FarmerRegistration" component={FarmerRegistrationScreen} />
      <Stack.Screen name="FarmerProfile" component={FarmerProfileScreen} />
      <Stack.Screen name="FarmRegistration" component={FarmRegistrationScreen} />
      <Stack.Screen name="LoanApplication" component={LoanApplicationScreen} />
    </Stack.Navigator>
  );
}

function JourneysStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="JourneyList" component={JourneyListScreen} />
      <Stack.Screen name="JourneyDetail" component={JourneyDetailScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Journeys" component={JourneysStack} options={{ title: 'Journeys' }} />
      <Tab.Screen name="Harvests" component={HarvestStack} />
      <Tab.Screen name="Expenses" component={ExpenseStack} />
      <Tab.Screen name="Farmers" component={FarmersStack} options={{ title: 'Farmers' }} />
      <Tab.Screen name="Marketplace" component={MarketplaceStack} />
      <Tab.Screen name="ML" component={MLStack} options={{ title: 'AI Tools' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <MainTabs /> : <AuthStack />;
}
