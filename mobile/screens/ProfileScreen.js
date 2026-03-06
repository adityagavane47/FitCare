import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, Alert
} from 'react-native';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';

const GOAL_LABELS = { lose: '🔥 Lose Weight', gain: '💪 Gain Muscle', maintain: '⚖️ Maintain' };
const ACTIVITY_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const ProfileScreen = ({ navigation, route }) => {
    const { userId } = route.params;
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fitcareAPI.getUser(userId).then(setUser).finally(() => setLoading(false));
    }, [userId]);

    const handleLogout = () => {
        Alert.alert('Logout', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: () => navigation.replace('Login') },
        ]);
    };

    if (loading) {
        return <View style={styles.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>;
    }

    const Row = ({ label, value }) => (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value ?? '—'}</Text>
        </View>
    );

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            {/* Avatar */}
            <View style={styles.avatarSection}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
                    </Text>
                </View>
                <Text style={styles.userName}>{user?.name || 'Athlete'}</Text>
                <Text style={styles.userPhone}>{user?.phone}</Text>
            </View>

            {/* Fitness Profile */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>🏋️ Fitness Profile</Text>
                <Row label="Goal" value={GOAL_LABELS[user?.fitness_goal]} />
                <Row label="Activity Level" value={ACTIVITY_LABELS[user?.activity_level]} />
                <Row label="Age" value={user?.age} />
                <Row label="Gender" value={user?.gender} />
                <Row label="Height" value={user?.height_cm ? `${user.height_cm} cm` : null} />
                <Row label="Weight" value={user?.weight_kg ? `${user.weight_kg} kg` : null} />
                {user?.email && <Row label="Email" value={user.email} />}
            </View>

            {/* BMI Quick View */}
            {user?.height_cm && user?.weight_kg && (() => {
                const bmi = (user.weight_kg / Math.pow(user.height_cm / 100, 2)).toFixed(1);
                return (
                    <View style={styles.bmiCard}>
                        <Text style={styles.bmiLabel}>BMI</Text>
                        <Text style={styles.bmiValue}>{bmi}</Text>
                    </View>
                );
            })()}

            {/* Edit Button */}
            <TouchableOpacity
                style={styles.editBtn}
                onPress={() => navigation.navigate('Onboarding', { userId, phone: user?.phone })}
            >
                <Text style={styles.editBtnText}>✏️ Edit Profile</Text>
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Text style={styles.logoutBtnText}>⏻ Logout</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background, padding: 16 },
    centered: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
    avatarSection: { alignItems: 'center', marginTop: 56, marginBottom: 28 },
    avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.primaryDim, borderWidth: 2, borderColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    avatarText: { fontSize: 40, fontWeight: '900', color: Colors.primary },
    userName: { color: Colors.text, fontSize: 22, fontWeight: '800' },
    userPhone: { color: Colors.textMuted, fontSize: 14, marginTop: 4 },
    card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, marginBottom: 12 },
    cardTitle: { color: Colors.primary, fontWeight: '700', fontSize: 14, marginBottom: 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
    rowLabel: { color: Colors.textMuted, fontSize: 14 },
    rowValue: { color: Colors.text, fontWeight: '600', fontSize: 14 },
    bmiCard: { backgroundColor: Colors.primaryDim, borderWidth: 1, borderColor: Colors.primary, borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    bmiLabel: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
    bmiValue: { color: Colors.primary, fontSize: 32, fontWeight: '900' },
    editBtn: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 10 },
    editBtnText: { color: Colors.text, fontWeight: '600', fontSize: 15 },
    logoutBtn: { backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(255,68,68,0.3)', borderRadius: 12, padding: 16, alignItems: 'center' },
    logoutBtnText: { color: Colors.danger, fontWeight: '700', fontSize: 15 },
});

export default ProfileScreen;
