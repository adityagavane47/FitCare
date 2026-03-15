import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';
import CustomHeader from '../components/CustomHeader';

const GOAL_LABELS = { lose: '🔥 Lose Weight', gain: '💪 Gain Muscle', maintain: '⚖️ Maintain' };
const ACTIVITY_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const HomeScreen = ({ route }) => {
    const { userId } = route.params;
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // AI Insights state
    const [quote, setQuote] = useState('');
    const [fact, setFact] = useState('');
    const [target, setTarget] = useState('');
    const [isLoadingInsights, setIsLoadingInsights] = useState(true);

    useEffect(() => {
        fitcareAPI.getUser(userId)
            .then(setUser)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [userId]);

    // Fetch AI daily insights
    useEffect(() => {
        setIsLoadingInsights(true);
        fitcareAPI.getDailyInsights(userId)
            .then(async (data) => {
                setQuote(data.quote || '');
                setFact(data.fact || '');
                setTarget(data.target || '');
                // Persist target for ProgressDashboard
                if (data.target) {
                    try {
                        await AsyncStorage.setItem('@fitcare_daily_target', data.target);
                    } catch (_) { }
                }
            })
            .catch(() => {
                setQuote('Discipline is choosing between what you want now and what you want most.');
                setFact('Consistent training improves your resting metabolic rate by up to 7%.');
                setTarget('Stay active — complete a 20-minute bodyweight circuit today.');
            })
            .finally(() => setIsLoadingInsights(false));
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

            {/* AI Motivational Quote */}
            <View style={styles.quoteCard}>
                {isLoadingInsights ? (
                    <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                    <Text style={styles.aiQuoteText}>"{quote}"</Text>
                )}
            </View>

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

            {/* AI Daily Knowledge Card */}
            <View style={styles.aiCard}>
                <Text style={styles.aiCardHeader}>🧠 AI DAILY KNOWLEDGE</Text>
                {isLoadingInsights ? (
                    <View style={styles.aiLoadingContainer}>
                        <ActivityIndicator color={Colors.primary} size="small" />
                        <Text style={styles.aiLoadingText}>AI is thinking...</Text>
                    </View>
                ) : (
                    <Text style={styles.aiFactText}>{fact}</Text>
                )}
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

    // AI Motivational Quote
    quoteCard: {
        backgroundColor: Colors.card, borderRadius: 16, padding: 20,
        marginHorizontal: 16, marginTop: 16,
        borderWidth: 1, borderColor: Colors.border,
        alignItems: 'center', minHeight: 60, justifyContent: 'center',
    },
    aiQuoteText: {
        color: '#FFFFFF', fontStyle: 'italic', fontSize: 15, lineHeight: 22,
        textAlign: 'center', textShadowColor: 'rgba(255,255,255,0.3)', textShadowRadius: 8,
    },

    // AI Daily Knowledge Card
    aiCard: {
        backgroundColor: Colors.card, borderRadius: 16, padding: 16,
        marginBottom: 12, borderWidth: 1.5, borderColor: Colors.primary,
    },
    aiCardHeader: {
        color: Colors.primary, fontWeight: '900', fontSize: 13,
        letterSpacing: 1.5, marginBottom: 12,
    },
    aiFactText: { color: Colors.text, fontSize: 14, lineHeight: 21 },
    aiLoadingContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    aiLoadingText: { color: Colors.textMuted, fontSize: 13 },

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
