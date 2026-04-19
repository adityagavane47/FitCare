import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator,
    Animated, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';
import CustomHeader from '../components/CustomHeader';
import { useFocusEffect } from '@react-navigation/native';
import { initializeWearable, fetchWorkoutHeartRateData } from '../services/wearable';

const GOAL_LABELS = { lose: '🔥 Lose Weight', gain: '💪 Gain Muscle', maintain: '⚖️ Maintain' };
const ACTIVITY_LABELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const HomeScreen = ({ route, navigation }) => {
    const { userId } = route.params;
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // AI Insights state
    const [quote, setQuote] = useState('');
    const [fact, setFact] = useState('');
    const [target, setTarget] = useState('');
    const [isLoadingInsights, setIsLoadingInsights] = useState(true);

    // Wearable / Health Connect state
    const [wearableConnected, setWearableConnected] = useState(false);
    const [todayHeartRate, setTodayHeartRate] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    // ── Animation refs ──
    /** Terminal boot: entire dashboard fades in from 0 → 1 */
    const fadeAnim = useRef(new Animated.Value(0)).current;
    /** Heartbeat: pulseDot scales 1 → 1.5 → 1 on loop */
    const pulseAnim = useRef(new Animated.Value(1)).current;
    /** Cyber button: SYNC NOW scales down on press, bounces back */
    const syncScaleAnim = useRef(new Animated.Value(1)).current;

    // Nutrition / Energy Intake state
    const [nutritionData, setNutritionData] = useState(null);
    /** Animated width percentage for calorie progress bar (useNativeDriver: false) */
    const calorieBarAnim = useRef(new Animated.Value(0)).current;
    const proteinBarAnim = useRef(new Animated.Value(0)).current;
    /** Cyber button for LOG FOOD */
    const logFoodScaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        fitcareAPI.getUser(userId)
            .then(setUser)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [userId]);

    // Animation 1 — Terminal Boot: fade in dashboard on mount
    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start();
    }, []);

    // Animation 2 — Heartbeat Pulse: loop when wearable is connected
    useEffect(() => {
        if (!wearableConnected) return;
        const heartbeat = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.5,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
            ])
        );
        heartbeat.start();
        return () => heartbeat.stop(); // cleanup on unmount / disconnect
    }, [wearableConnected]);

    // Initialize Health Connect once on mount; auto-fetch if granted
    useEffect(() => {
        (async () => {
            const granted = await initializeWearable();
            setWearableConnected(granted);
            if (granted) {
                await fetchTodayVitals();
            }
        })();
    }, []);

    /** Fetches today's average heart rate from Health Connect. */
    const fetchTodayVitals = async () => {
        setIsSyncing(true);
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const now = new Date();
            const avgHR = await fetchWorkoutHeartRateData(
                startOfDay.toISOString(),
                now.toISOString()
            );
            setTodayHeartRate(avgHR);
        } catch (_) {
            setTodayHeartRate(null);
        } finally {
            setIsSyncing(false);
        }
    };

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

    // Fetch nutrition data every time HomeScreen gains focus
    useFocusEffect(
        useCallback(() => {
            (async () => {
                try {
                    const data = await fitcareAPI.fetchTodayNutrition();
                    setNutritionData(data);
                    const calPct = Math.min((data.total_calories / data.calorie_goal) * 100, 100);
                    const proPct = Math.min((data.total_protein / data.protein_goal) * 100, 100);
                    Animated.parallel([
                        Animated.timing(calorieBarAnim, {
                            toValue: calPct,
                            duration: 700,
                            useNativeDriver: false,
                        }),
                        Animated.timing(proteinBarAnim, {
                            toValue: proPct,
                            duration: 700,
                            useNativeDriver: false,
                        }),
                    ]).start();
                } catch (_) {
                    // Silently fail — card just shows 0
                }
            })();
        }, [])
    );

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
            {/* Animation 1 — Terminal Boot fade-in wrapper */}
            <Animated.View style={{ opacity: fadeAnim }}>

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
                <Text style={styles.aiCardHeader}> AI DAILY KNOWLEDGE</Text>
                {isLoadingInsights ? (
                    <View style={styles.aiLoadingContainer}>
                        <ActivityIndicator color={Colors.primary} size="small" />
                        <Text style={styles.aiLoadingText}>AI is thinking...</Text>
                    </View>
                ) : (
                    <Text style={styles.aiFactText}>{fact}</Text>
                )}
            </View>

            {/* ── Wearable Link Card ── */}
            <View style={styles.wearableCard}>
                {/* Card Header */}
                <View style={styles.wearableHeader}>
                    <View style={styles.wearableTitleRow}>
                        {/* Animation 2 — Animated pulse dot */}
                        {wearableConnected && (
                            <Animated.View
                                style={[
                                    styles.pulseDot,
                                    { transform: [{ scale: pulseAnim }] },
                                ]}
                            />
                        )}
                        <Text style={styles.wearableTitle}> WEARABLE LINK</Text>
                    </View>
                    {/* Animation 3 — Cyber Pressable SYNC NOW button */}
                    <Animated.View style={{ transform: [{ scale: syncScaleAnim }] }}>
                        <Pressable
                            style={[
                                styles.syncButton,
                                isSyncing && styles.syncButtonDisabled,
                            ]}
                            onPress={fetchTodayVitals}
                            disabled={isSyncing}
                            accessibilityLabel="Sync wearable data now"
                            onPressIn={() =>
                                Animated.spring(syncScaleAnim, {
                                    toValue: 0.95,
                                    useNativeDriver: true,
                                    speed: 50,
                                    bounciness: 4,
                                }).start()
                            }
                            onPressOut={() =>
                                Animated.spring(syncScaleAnim, {
                                    toValue: 1,
                                    useNativeDriver: true,
                                    speed: 20,
                                    bounciness: 10,
                                }).start()
                            }
                        >
                            {isSyncing ? (
                                <ActivityIndicator color={Colors.primary} size={12} />
                            ) : (
                                <Text style={styles.syncButtonText}>SYNC NOW</Text>
                            )}
                        </Pressable>
                    </Animated.View>
                </View>

                {/* Card Body */}
                {wearableConnected ? (
                    <View style={styles.wearableBody}>
                        <View style={styles.hrValueRow}>
                            <Text style={styles.hrValue}>
                                {todayHeartRate !== null ? todayHeartRate : '--'}
                            </Text>
                            <Text style={styles.hrUnit}>bpm</Text>
                        </View>
                        <Text style={styles.hrLabel}>Today's Avg Heart Rate</Text>
                    </View>
                ) : (
                    <Text style={styles.wearableLockedText}>
                        Health Connect vault locked or unavailable.
                    </Text>
                )}
            </View>

            {/* ── Energy Intake Card ── */}
            <View style={styles.energyCard}>
                <View style={styles.energyHeader}>
                    <Text style={styles.energyTitle}>⚡ ENERGY INTAKE</Text>
                    <Animated.View style={{ transform: [{ scale: logFoodScaleAnim }] }}>
                        <Pressable
                            style={styles.logFoodButton}
                            onPress={() => navigation.navigate('LogFood')}
                            onPressIn={() =>
                                Animated.spring(logFoodScaleAnim, {
                                    toValue: 0.95,
                                    useNativeDriver: true,
                                    speed: 50,
                                    bounciness: 4,
                                }).start()
                            }
                            onPressOut={() =>
                                Animated.spring(logFoodScaleAnim, {
                                    toValue: 1,
                                    useNativeDriver: true,
                                    speed: 20,
                                    bounciness: 10,
                                }).start()
                            }
                        >
                            <Text style={styles.logFoodButtonText}>+ LOG FOOD</Text>
                        </Pressable>
                    </Animated.View>
                </View>

                {/* Calorie bar */}
                <Text style={styles.barLabel}>
                    Calories: {nutritionData?.total_calories ?? 0} / {nutritionData?.calorie_goal ?? 2500} kcal
                </Text>
                <View style={styles.barTrack}>
                    <Animated.View
                        style={[
                            styles.barFill,
                            {
                                width: calorieBarAnim.interpolate({
                                    inputRange: [0, 100],
                                    outputRange: ['0%', '100%'],
                                }),
                            },
                        ]}
                    />
                </View>

                {/* Protein bar */}
                <Text style={[styles.barLabel, { marginTop: 14 }]}>
                    Protein: {nutritionData?.total_protein ?? 0} / {nutritionData?.protein_goal ?? 150} g
                </Text>
                <View style={styles.barTrack}>
                    <Animated.View
                        style={[
                            styles.barFillProtein,
                            {
                                width: proteinBarAnim.interpolate({
                                    inputRange: [0, 100],
                                    outputRange: ['0%', '100%'],
                                }),
                            },
                        ]}
                    />
                </View>

                {nutritionData && (
                    <Text style={styles.itemsLogged}>
                        {nutritionData.items_logged} item{nutritionData.items_logged !== 1 ? 's' : ''} logged today
                    </Text>
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
            </Animated.View>{/* end fade-in wrapper */}
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

    // ── Wearable Link Card ──
    wearableCard: {
        backgroundColor: '#050F05',
        borderWidth: 1.5,
        borderColor: '#10B981',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#10B981',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 6,
    },
    wearableHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    wearableTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pulseDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: '#10B981',
        shadowColor: '#10B981',
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 4,
    },
    wearableTitle: {
        color: '#10B981',
        fontWeight: '900',
        fontSize: 13,
        letterSpacing: 1.8,
    },
    syncButton: {
        borderWidth: 1,
        borderColor: '#10B981',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 5,
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        minWidth: 80,
        alignItems: 'center',
        justifyContent: 'center',
    },
    syncButtonDisabled: {
        borderColor: 'rgba(16, 185, 129, 0.3)',
        backgroundColor: 'rgba(16, 185, 129, 0.03)',
    },
    syncButtonText: {
        color: '#10B981',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    wearableBody: {
        alignItems: 'flex-start',
    },
    hrValueRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 6,
    },
    hrValue: {
        fontSize: 52,
        fontWeight: '900',
        color: '#10B981',
        textShadowColor: 'rgba(16, 185, 129, 0.5)',
        textShadowRadius: 12,
        lineHeight: 60,
    },
    hrUnit: {
        fontSize: 18,
        fontWeight: '700',
        color: '#10B981',
        marginBottom: 8,
        opacity: 0.85,
    },
    hrLabel: {
        color: '#6B7280',
        fontSize: 12,
        letterSpacing: 0.8,
        marginTop: 2,
    },
    wearableLockedText: {
        color: '#4B5563',
        fontStyle: 'italic',
        fontSize: 13,
        lineHeight: 20,
        paddingVertical: 4,
    },
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

    // ── Energy Intake Card ──
    energyCard: {
        backgroundColor: '#050A14',
        borderWidth: 1.5,
        borderColor: '#3B82F6',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#3B82F6',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    energyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    energyTitle: {
        color: '#3B82F6',
        fontWeight: '900',
        fontSize: 13,
        letterSpacing: 1.8,
    },
    logFoodButton: {
        borderWidth: 1,
        borderColor: '#3B82F6',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 5,
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
    },
    logFoodButtonText: {
        color: '#3B82F6',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    barLabel: {
        color: '#6B7280',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
    },
    barTrack: {
        height: 10,
        backgroundColor: '#1E1E1E',
        borderRadius: 5,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        backgroundColor: '#3B82F6',
        borderRadius: 5,
        shadowColor: '#3B82F6',
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 4,
    },
    barFillProtein: {
        height: '100%',
        backgroundColor: '#10B981',
        borderRadius: 5,
        shadowColor: '#10B981',
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 4,
    },
    itemsLogged: {
        color: '#4B5563',
        fontSize: 11,
        marginTop: 10,
        fontStyle: 'italic',
    },
});

export default HomeScreen;
