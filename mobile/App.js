import 'react-native-gesture-handler';
import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

// Import Screens
import LoginScreen from './screens/LoginScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import BottomTabs from './components/BottomTabs';
import FormCorrectionScreen from './screens/FormCorrectionScreen';

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

const Stack = createStackNavigator();

export default function App() {
    return (
        <GestureHandlerRootView style={styles.container}>
            <NavigationContainer>
                <StatusBar style="light" backgroundColor="#000000" />
                <Stack.Navigator
                    initialRouteName="Login"
                    screenOptions={{ headerShown: false }}
                >
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                    <Stack.Screen name="Main" component={BottomTabs} />
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
