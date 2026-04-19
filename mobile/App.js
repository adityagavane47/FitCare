import 'react-native-gesture-handler';
import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';

// Import Screens
import LoginScreen from './screens/LoginScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import HomeScreen from './screens/HomeScreen';
import ProgressDashboard from './screens/ProgressDashboard';
import DietPlanner from './screens/DietPlanner';
import AIChatScreen from './screens/AIChatScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import AIVisionScreen from './screens/AIVisionScreen';
import VideoLibraryScreen from './screens/VideoLibraryScreen';
import ProfileScreen from './screens/ProfileScreen';
import FormCorrectionScreen from './screens/FormCorrectionScreen';
import LogFoodScreen from './screens/LogFoodScreen';

// --- GLOBAL MONKEY-PATCH FOR TENSORFLOW.JS COMPATIBILITY ---
import * as ExpoCamera from 'expo-camera';

// The tfjs-react-native library depends on legacy Camera.Constants structure.
// We patch both the named export and the module-level object if possible.
const patchTarget = ExpoCamera.CameraView || ExpoCamera.Camera || {};
if (!patchTarget.Constants) {
    const constants = {
        Type: { back: 'back', front: 'front' },
        FlashMode: { off: 'off', on: 'on', auto: 'auto', torch: 'torch' },
    };
    try {
        Object.defineProperty(patchTarget, 'Constants', {
            get: () => constants,
            enumerable: true,
            configurable: true
        });
        if (ExpoCamera.Camera && !ExpoCamera.Camera.Constants) {
            ExpoCamera.Camera.Constants = constants;
        }
    } catch (e) {
        // Fallback for non-configurable objects
        patchTarget.Constants = constants;
    }
}
// ---------------------------------------------------------

import { createDrawerNavigator } from '@react-navigation/drawer';
import { Colors } from './constants/Colors';
import CustomDrawerContent from './components/CustomDrawerContent';

// ====================================================
//  ASSET PRELOADING — Keep splash screen until ready
// ====================================================
SplashScreen.preventAutoHideAsync();

const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

function MainDrawer({ route }) {
    const { userId } = route.params;
    return (
        <Drawer.Navigator
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
                headerShown: false,
                drawerStyle: { backgroundColor: '#0A0A0A', width: 280 },
                drawerActiveTintColor: '#39FF14',
                drawerInactiveTintColor: '#6d6d80',
                drawerLabelStyle: { fontWeight: '900', letterSpacing: 1, fontSize: 13 },
                drawerItemStyle: { marginVertical: 5, borderRadius: 8 },
            }}
        >
            <Drawer.Screen
                name="Home"
                component={HomeScreen}
                initialParams={{ userId }}
                options={{ title: '🏠 HOME_BASE' }}
            />
            <Drawer.Screen
                name="Workout"
                component={WorkoutScreen}
                initialParams={{ userId }}
                options={{ title: '⚡ WORKOUT_PROTOCOL' }}
            />
            <Drawer.Screen
                name="Vision"
                component={AIVisionScreen}
                initialParams={{ userId }}
                options={{ title: '👁️ VISION_SYSTEM' }}
            />
            <Drawer.Screen
                name="Diet"
                component={DietPlanner}
                initialParams={{ userId }}
                options={{ title: '🥗 DIET_ARCHITECT' }}
            />
            <Drawer.Screen
                name="Progress"
                component={ProgressDashboard}
                initialParams={{ userId }}
                options={{ title: '📊 PROGRESS_STATS' }}
            />
            <Drawer.Screen
                name="AICoach"
                component={AIChatScreen}
                initialParams={{ userId }}
                options={{ title: '🤖 AI_COACH' }}
            />
            <Drawer.Screen
                name="Videos"
                component={VideoLibraryScreen}
                initialParams={{ userId }}
                options={{ title: '🎬 VIDEO_VAULT' }}
            />
            <Drawer.Screen
                name="Settings"
                component={ProfileScreen}
                initialParams={{ userId }}
                options={{ title: '⚙️ SYSTEM_SETTINGS' }}
            />
            <Drawer.Screen
                name="LogFood"
                component={LogFoodScreen}
                initialParams={{ userId }}
                options={{ title: '🍽️ LOG_FOOD' }}
            />
        </Drawer.Navigator>
    );
}

export default function App() {
    const [appIsReady, setAppIsReady] = useState(false);

    useEffect(() => {
        async function loadAssets() {
            try {
                // Load custom Cyberpunk fonts
                await Font.loadAsync({
                    'Orbitron': require('./assets/fonts/Orbitron-Regular.ttf'),
                    'Orbitron-Bold': require('./assets/fonts/Orbitron-Bold.ttf'),
                });
            } catch (e) {
                // Font loading failed — continue with system fonts
                console.warn('[App] Font loading failed, using system fallbacks:', e.message);
            } finally {
                setAppIsReady(true);
            }
        }

        loadAssets();
    }, []);

    const onLayoutRootView = useCallback(async () => {
        if (appIsReady) {
            // Hide the splash screen once fonts are loaded and
            // the root view has performed its first layout.
            await SplashScreen.hideAsync();
        }
    }, [appIsReady]);

    // Don't render anything until assets are loaded — splash screen stays visible
    if (!appIsReady) {
        return null;
    }

    return (
        <GestureHandlerRootView style={styles.container} onLayout={onLayoutRootView}>
            <NavigationContainer>
                <StatusBar style="light" backgroundColor="#000000" />
                <Stack.Navigator
                    initialRouteName="Login"
                    screenOptions={{ headerShown: false }}
                >
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                    <Stack.Screen name="Main" component={MainDrawer} />
                    <Stack.Screen name="FormCorrection" component={FormCorrectionScreen} />
                </Stack.Navigator>
            </NavigationContainer>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
