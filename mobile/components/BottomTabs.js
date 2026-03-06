import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { Colors } from '../constants/Colors';

import HomeScreen from '../screens/HomeScreen';
import ProgressDashboard from '../screens/ProgressDashboard';
import DietPlanner from '../screens/DietPlanner';
import WorkoutScreen from '../screens/WorkoutScreen';
import VideoLibraryScreen from '../screens/VideoLibraryScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

const TabIcon = ({ icon, label, focused }) => (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22, marginBottom: 2 }}>{icon}</Text>
        <Text style={{ fontSize: 10, color: focused ? Colors.primary : Colors.textDim, fontWeight: focused ? '700' : '500' }}>
            {label}
        </Text>
    </View>
);

export default function BottomTabs({ route }) {
    const { userId } = route.params;

    const screenOptions = {
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
            backgroundColor: '#0A0A0A',
            borderTopWidth: 1,
            borderTopColor: 'rgba(0, 255, 0, 0.2)',
            height: 75,
            paddingBottom: 10,
            paddingTop: 8,
        },
        tabBarActiveBackgroundColor: 'rgba(0, 255, 0, 0.08)',
        tabBarItemStyle: { borderRadius: 10, marginHorizontal: 2 },
    };

    const makeInitialParams = () => ({ userId });

    return (
        <Tab.Navigator screenOptions={screenOptions} initialRouteName="Home">
            <Tab.Screen
                name="Home" component={HomeScreen}
                initialParams={makeInitialParams()}
                options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Home" focused={focused} /> }}
            />
            <Tab.Screen
                name="Progress" component={ProgressDashboard}
                initialParams={makeInitialParams()}
                options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📊" label="Progress" focused={focused} /> }}
            />
            <Tab.Screen
                name="Diet" component={DietPlanner}
                initialParams={makeInitialParams()}
                options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🥗" label="Diet" focused={focused} /> }}
            />
            <Tab.Screen
                name="Workout" component={WorkoutScreen}
                initialParams={makeInitialParams()}
                options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⚡" label="Workout" focused={focused} /> }}
            />
            <Tab.Screen
                name="Videos" component={VideoLibraryScreen}
                initialParams={makeInitialParams()}
                options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🎬" label="Videos" focused={focused} /> }}
            />
            <Tab.Screen
                name="Profile" component={ProfileScreen}
                initialParams={makeInitialParams()}
                options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👤" label="Profile" focused={focused} /> }}
            />
        </Tab.Navigator>
    );
}
