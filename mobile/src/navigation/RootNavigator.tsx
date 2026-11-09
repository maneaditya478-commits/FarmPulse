import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Bot, HeartPulse, House, PawPrint, UserRound } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors } from '../theme';
import { AnimalDetailScreen } from '../screens/AnimalDetailScreen';
import { AnimalFormScreen } from '../screens/AnimalFormScreen';
import { AnimalsScreen } from '../screens/AnimalsScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { HealthScreen } from '../screens/HealthScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { NearbyVetsScreen } from '../screens/NearbyVetsScreen';
import { NutritionScreen } from '../screens/NutritionScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SyncCentreScreen } from '../screens/SyncCentreScreen';
import { VaccinationsScreen } from '../screens/VaccinationsScreen';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS = {
  Home: House,
  Animals: PawPrint,
  Health: HeartPulse,
  Assistant: Bot,
  Profile: UserRound,
} as const;

function Tabs() {
  const { t } = useLanguage();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.leaf700,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarIcon: ({ color, size }) => {
          const Icon = TAB_ICONS[route.name];
          return <Icon color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t('tabs.home') }} />
      <Tab.Screen name="Animals" component={AnimalsScreen} options={{ title: t('tabs.animals') }} />
      <Tab.Screen name="Health" component={HealthScreen} options={{ title: t('tabs.health') }} />
      <Tab.Screen name="Assistant" component={AssistantScreen} options={{ title: t('tabs.assistant') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t('tabs.profile') }} />
    </Tab.Navigator>
  );
}

function Splash() {
  const { t } = useLanguage();
  return (
    <View style={styles.splash}>
      <View style={styles.splashMark}>
        <Text style={styles.splashLeaf}>🌿</Text>
      </View>
      <Text style={styles.splashTitle}>{t('app.name')}</Text>
      <ActivityIndicator color={colors.leaf700} />
    </View>
  );
}

export function RootNavigator() {
  const { token, booting } = useAuth();

  if (booting) return <Splash />;
  if (!token) return <LoginScreen />;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="AnimalForm" component={AnimalFormScreen} />
      <Stack.Screen name="AnimalDetail" component={AnimalDetailScreen} />
      <Stack.Screen name="Vaccinations" component={VaccinationsScreen} />
      <Stack.Screen name="Nutrition" component={NutritionScreen} />
      <Stack.Screen name="NearbyVets" component={NearbyVetsScreen} />
      <Stack.Screen name="SyncCentre" component={SyncCentreScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
  },
  tabLabel: { fontSize: 10, fontWeight: '700' },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: colors.background,
  },
  splashMark: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: colors.leaf50,
    borderWidth: 1,
    borderColor: colors.leaf200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLeaf: { fontSize: 30 },
  splashTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
});
