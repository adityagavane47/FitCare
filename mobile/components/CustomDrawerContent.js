import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Colors } from '../constants/Colors';

const CustomDrawerContent = (props) => {
    const { userId } = props.state.routes[0].params || {};

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
            <View style={styles.drawerHeader}>
                <Text style={styles.logo}>⚡</Text>
                <View>
                    <Text style={styles.headerTitle}>FITCARE_OS</Text>
                    <Text style={styles.headerSubtitle}>v1.0.4_STABLE</Text>
                </View>
            </View>

            <View style={styles.divider} />

            <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
                <View style={styles.sectionLabel}>
                    <Text style={styles.sectionLabelText}>NAVIGATION_PROTOCOLS</Text>
                </View>
                <DrawerItemList {...props} />

                <View style={styles.divider} />

                <View style={styles.sectionLabel}>
                    <Text style={styles.sectionLabelText}>SYSTEM_STATS</Text>
                </View>
                <View style={styles.statsBox}>
                    <Text style={styles.statsText}>USER_ID: {userId || 'ANONYMOUS'}</Text>
                    <Text style={styles.statsText}>STATUS: OPTIMIZED</Text>
                    <Text style={styles.statsText}>UPTIME: 98.4%</Text>
                </View>
            </DrawerContentScrollView>

            <View style={styles.drawerFooter}>
                <TouchableOpacity style={styles.logoutBtn} onPress={() => props.navigation.replace('Login')}>
                    <Text style={styles.logoutText}>TERMINATE_SESSION</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    drawerHeader: {
        padding: 24,
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
    },
    logo: {
        fontSize: 32,
        marginRight: 16,
        color: Colors.primary,
        textShadowColor: Colors.primaryGlow,
        textShadowRadius: 10,
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 2,
    },
    headerSubtitle: {
        color: Colors.primary,
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1,
        opacity: 0.8,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(57, 255, 20, 0.15)',
        marginHorizontal: 20,
        marginVertical: 10,
    },
    sectionLabel: {
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    sectionLabelText: {
        color: '#6d6d80',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    statsBox: {
        marginHorizontal: 20,
        padding: 16,
        backgroundColor: 'rgba(57, 255, 20, 0.05)',
        borderRadius: 8,
        borderLeftWidth: 2,
        borderLeftColor: Colors.primary,
    },
    statsText: {
        color: Colors.primary,
        fontSize: 10,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        marginBottom: 4,
    },
    drawerFooter: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.05)',
    },
    logoutBtn: {
        padding: 14,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FF3131',
        borderRadius: 8,
    },
    logoutText: {
        color: '#FF3131',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
    },
});

export default CustomDrawerContent;
