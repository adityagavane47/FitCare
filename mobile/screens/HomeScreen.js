import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity
} from 'react-native';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';
import CustomHeader from '../components/CustomHeader';

const QUOTES = [
    '"The pain you feel today will be the strength you feel tomorrow."',
    '"Push yourself, because no one else is going to do it for you."',
    '"Success starts with self-discipline."',
    '"Your body can stand almost anything. It\'s your mind you have to convince."',
    '"Fitness is not about being better than someone else. It\'s about being better than you used to be."',
];

const GOAL_LABELS = { lose: '🔥 Lose Weight', gain: '💪 Gain Muscle', maintain: '⚖️ Maintain' };
const ACTIVITY_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const HomeScreen = ({ route }) => {
    const { userId } = route.params;
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const quote = QUOTES[new Date().getDay() % QUOTES.length];

    useEffect(() => {
        fitcareAPI.getUser(userId)
            .then(setUser)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [userId]);

    const bmi = user && user.height_cm && user.weight_kg
        ? (user.weight_kg / Math.pow(user.height_cm / 100, 2)).toFixed(1)
        : null;

    const getBmiCategory = (b) => {
        if (!b) return '';
        if (b < 18.5) return 'Underweight';
        if (b < 25) return 'Normal';
        if (b < 30) return 'Overweight';
        return 'Obese';
    };

    if (loading) {
        return <View style={styles.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>;
    }

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <CustomHeader title="FitCare Hub" />

            {/* Header Summary */}
            <View style={styles.headerSummary}>
                <View>
                    <Text style={styles.greeting}>Good day,</Text>
                    <Text style={styles.name}>
                        {user?.name || 'Athlete'} <Text style={styles.nameAccent}>⚡</Text>
                    </Text>
                </View>
                <View style={styles.goalBadge}>
                    <Text style={styles.goalBadgeText}>{GOAL_LABELS[user?.fitness_goal] || '—'}</Text>
                </View>
            </View>

            {/* Daily Quote */}
            <View style={styles.quoteCard}>
                <Text style={styles.quoteIcon}>💬</Text>
                <Text style={styles.quoteText}>{quote}</Text>
            </View>

            {/* BMI Card */}
            {bmi && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>📊 Your BMI</Text>
                    <View style={styles.bmiRow}>
                        <Text style={styles.bmiValue}>{bmi}</Text>
                        <View>
                            <Text style={styles.bmiCategory}>{getBmiCategory(parseFloat(bmi))}</Text>
                            <Text style={styles.bmiSub}>Body Mass Index</Text>
                        </View>
                    </View>
                    <View style={styles.bmiScale}>
                        {[
                            { label: '< 18.5', tag: 'Underweight', color: '#3B82F6' },
                            { label: '18.5–24.9', tag: 'Normal', color: Colors.primary },
                            { label: '25–29.9', tag: 'Overweight', color: Colors.warning },
                            { label: '≥ 30', tag: 'Obese', color: Colors.danger },
                        ].map((r) => (
                            <View key={r.tag} style={styles.bmiRow2}>
                                <View style={[styles.bmiDot, { backgroundColor: r.color }]} />
                                <Text style={styles.bmiScaleText}>{r.label} — {r.tag}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* Stats Row */}
            <View style={styles.statsRow}>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{user?.height_cm ?? '—'}</Text>
                    <Text style={styles.statLabel}>Height (cm)</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{user?.weight_kg ?? '—'}</Text>
                    <Text style={styles.statLabel}>Weight (kg)</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{user?.age ?? '—'}</Text>
                    <Text style={styles.statLabel}>Age</Text>
                </View>
            </View>

            {/* Profile Summary */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>⚙️ Current Programme</Text>
                <View style={styles.programRow}>
                    <Text style={styles.programLabel}>Goal</Text>
                    <Text style={styles.programValue}>{GOAL_LABELS[user?.fitness_goal] || '—'}</Text>
                </View>
                <View style={styles.programRow}>
                    <Text style={styles.programLabel}>Activity</Text>
                    <Text style={styles.programValue}>{ACTIVITY_LABELS[user?.activity_level] || '—'}</Text>
                </View>
                <View style={styles.programRow}>
                    <Text style={styles.programLabel}>Gender</Text>
                    <Text style={styles.programValue}>{user?.gender ?? '—'}</Text>
                </View>
            </View>

            <View style={{ height: 20 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
    headerSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, marginTop: 20, marginBottom: 20 },
    greeting: { color: Colors.textMuted, fontSize: 14 },
    name: { color: Colors.text, fontSize: 26, fontWeight: '800', marginTop: 2 },
    nameAccent: { color: Colors.primary },
    goalBadge: { backgroundColor: Colors.primaryDim, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    goalBadgeText: { color: Colors.primary, fontSize: 12, fontWeight: '700' },
    quoteCard: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    quoteIcon: { fontSize: 20, marginTop: 2 },
    quoteText: { flex: 1, color: Colors.primary, fontStyle: 'italic', lineHeight: 20, fontSize: 13 },
    card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, marginBottom: 12 },
    cardTitle: { color: Colors.primary, fontWeight: '700', fontSize: 14, marginBottom: 12 },
    bmiRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
    bmiValue: { fontSize: 48, fontWeight: '900', color: Colors.primary, textShadowColor: Colors.primaryGlow, textShadowRadius: 10 },
    bmiCategory: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
    bmiSub: { color: Colors.textMuted, fontSize: 12 },
    bmiScale: { gap: 6 },
    bmiRow2: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    bmiDot: { width: 8, height: 8, borderRadius: 4 },
    bmiScaleText: { color: Colors.textMuted, fontSize: 12 },
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    statCard: { flex: 1, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 14, alignItems: 'center' },
    statValue: { color: Colors.primary, fontSize: 22, fontWeight: '800' },
    statLabel: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
    programRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
    programLabel: { color: Colors.textMuted, fontSize: 14 },
    programValue: { color: Colors.text, fontSize: 14, fontWeight: '600' },
});

export default HomeScreen;
