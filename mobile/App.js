import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

import LoginScreen from './screens/LoginScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import BottomTabs from './components/BottomTabs';

const Stack = createStackNavigator();

export default function App() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <NavigationContainer>
                <StatusBar style="light" backgroundColor="#000000" />
                <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>

                    {/* Auth Flow */}
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Onboarding" component={OnboardingScreen} />

                    {/* Main App — contains Bottom Tabs */}
                    <Stack.Screen name="Main" component={BottomTabs} />

                </Stack.Navigator>
            </NavigationContainer>
        </GestureHandlerRootView>
    );
}
