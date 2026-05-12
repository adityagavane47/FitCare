import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, ActivityIndicator,
    Pressable, Dimensions, Platform,
} from 'react-native';
import Animated, {
    useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
    interpolate, Extrapolation, withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import { initializeWearable, fetchWorkoutHeartRateData } from '../services/wearable';
import GlassCard, { FloatInCard } from '../components/GlassCard';
import { useNavigation, DrawerActions } from '@react-navigation/native';

const { width: W } = Dimensions.get('window');
const HEADER_H = Platform.OS === 'ios' ? 100 : 86;
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const NEON = '#39FF14';
const BLUE = '#3B82F6';

const GOAL_LABELS = { lose: '🔥 Lose Weight', gain: '💪 Gain Muscle', maintain: '⚖️ Maintain' };

// ─── Frosted progress bar ─────────────────────────────────────────────────────
const GlassBar = ({ pct = 0, color = NEON, label, value }) => (
    <View style={bar.wrap}>
        <View style={bar.labelRow}>
            <Text style={[bar.label, { fontFamily: 'Orbitron', color }]}>{label}</Text>
            <Text style={[bar.value, { color }]}>{value}</Text>
        </View>
        <View style={bar.track}>
            <MotiView
                from={{ width: '0%' }}
                animate={{ width: `${Math.min(pct, 100)}%` }}
                transition={{ type: 'timing', duration: 900, delay: 200 }}
                style={[bar.fill, {
                    backgroundColor: color,
                    shadowColor: color,
                    shadowOpacity: 0.7,
                    shadowRadius: 6,
                    shadowOffset: { width: 0, height: 0 },
                }]}
            />
        </View>
    </View>
);

const bar = StyleSheet.create({
    wrap:     { marginBottom: 14 },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    label:    { fontSize: 10, letterSpacing: 2, color: NEON },
    value:    { fontSize: 12, fontWeight: '700', color: NEON },
    track:    { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
    fill:     { height: '100%', borderRadius: 3, elevation: 4 },
});

// ─── Stat Pill ────────────────────────────────────────────────────────────────
const Stat = ({ value, unit, label, color = NEON }) => (
    <View style={stat.wrap}>
        <Text style={[stat.value, { color, fontFamily: 'Orbitron-Bold' }]}>{value}</Text>
        <Text style={[stat.unit, { color }]}>{unit}</Text>
        <Text style={stat.label}>{label}</Text>
    </View>
);
const stat = StyleSheet.create({
    wrap:  { alignItems: 'center', flex: 1 },
    value: { fontSize: 26, fontWeight: '900' },
    unit:  { fontSize: 11, fontWeight: '600', marginTop: -2, opacity: 0.75 },
    label: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 4, fontFamily: MONO, letterSpacing: 1 },
});

// ─── Animated Blurred Header ──────────────────────────────────────────────────
const BlurHeader = ({ scrollY, navigation }) => {
    const animStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP),
    }));

    return (
        <View style={header.root} pointerEvents="box-none">
            {/* Blur layer fades in as user scrolls */}
            <Animated.View style={[StyleSheet.absoluteFill, animStyle]} pointerEvents="none">
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                <LinearGradient
                    colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)']}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
            {/* Always-visible content */}
            <View style={header.content}>
                <Pressable onPress={() => navigation.dispatch(DrawerActions.openDrawer())} style={header.menuBtn}>
                    <View style={[header.line, { marginBottom: 4 }]} />
                    <View style={header.line} />
                    <View style={[header.line, { marginTop: 4, width: 14 }]} />
                </Pressable>
                <Text style={[header.title, { fontFamily: 'Orbitron-Bold' }]}>FITCARE HUB</Text>
                <View style={{ width: 40 }} />
            </View>
            {/* Bottom neon line */}
            <Animated.View style={[header.glow, animStyle]} pointerEvents="none" />
        </View>
    );
};
const header = StyleSheet.create({
    root:    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, height: HEADER_H },
    content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 52 : 42, paddingBottom: 12 },
    title:   { color: NEON, fontSize: 16, letterSpacing: 3, textShadowColor: NEON, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
    menuBtn: { width: 40, justifyContent: 'center' },
    line:    { height: 2, backgroundColor: NEON, borderRadius: 1, width: 22 },
    glow:    { height: 1, backgroundColor: NEON, shadowColor: NEON, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, marginHorizontal: 20, borderRadius: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
const HomeScreen = ({ route, navigation }) => {
    const { userId } = route.params;
    const [user, setUser]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [quote, setQuote]       = useState('');
    const [fact, setFact]         = useState('');
    const [insightsLoading, setInsightsLoading] = useState(true);
    const [wearableOk, setWearableOk]           = useState(false);
    const [heartRate, setHeartRate]             = useState(null);
    const [syncing, setSyncing]                 = useState(false);
    const [nutrition, setNutrition]             = useState(null);

    const scrollY = useSharedValue(0);
    const syncScale = useSharedValue(1);

    const scrollHandler = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });

    // Load user
    useEffect(() => {
        fitcareAPI.getUser(userId)
            .then(setUser)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [userId]);

    // AI insights
    useEffect(() => {
        setInsightsLoading(true);
        fitcareAPI.getDailyInsights(userId)
            .then(d => { setQuote(d.quote || ''); setFact(d.fact || ''); })
            .catch(() => {
                setQuote('Discipline is choosing between what you want now and what you want most.');
                setFact('Consistent training improves your resting metabolic rate by up to 7%.');
            })
            .finally(() => setInsightsLoading(false));
    }, [userId]);

    // Wearable init
    useEffect(() => {
        (async () => {
            const ok = await initializeWearable();
            setWearableOk(ok);
            if (ok) syncVitals();
        })();
    }, []);

    const syncVitals = async () => {
        setSyncing(true);
        try {
            const start = new Date(); start.setHours(0, 0, 0, 0);
            const hr = await fetchWorkoutHeartRateData(start.toISOString(), new Date().toISOString());
            setHeartRate(hr);
        } catch (_) { setHeartRate(null); }
        finally { setSyncing(false); }
    };

    // Nutrition on focus
    useFocusEffect(useCallback(() => {
        fitcareAPI.fetchTodayNutrition()
            .then(setNutrition)
            .catch(() => {});
    }, []));

    const bmi = user?.height_cm && user?.weight_kg
        ? (user.weight_kg / Math.pow(user.height_cm / 100, 2)).toFixed(1)
        : null;
    const bmiCat = b => b < 18.5 ? 'Underweight' : b < 25 ? 'Normal' : b < 30 ? 'Overweight' : 'Obese';

    const calPct  = nutrition ? Math.min((nutrition.total_calories / nutrition.calorie_goal) * 100, 100) : 0;
    const proPct  = nutrition ? Math.min((nutrition.total_protein  / nutrition.protein_goal)  * 100, 100) : 0;

    const syncBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: syncScale.value }] }));

    if (loading) return (
        <View style={s.root}>
            <ActivityIndicator color={NEON} size="large" style={{ flex: 1 }} />
        </View>
    );

    return (
        <View style={s.root}>
            {/* Scrollable content */}
            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={s.scroll}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Quote banner ── */}
                <FloatInCard delay={0}>
                    <GlassCard glowColor="green" intensity={30} style={s.quoteCard}>
                        {insightsLoading
                            ? <ActivityIndicator color={NEON} />
                            : <Text style={s.quoteText}>"{quote}"</Text>}
                    </GlassCard>
                </FloatInCard>

                {/* ── Greeting ── */}
                <MotiView
                    from={{ opacity: 0, translateX: -20 }}
                    animate={{ opacity: 1, translateX: 0 }}
                    transition={{ type: 'spring', damping: 16, stiffness: 130, delay: 120 }}
                    style={s.greetRow}
                >
                    <View>
                        <Text style={s.greetSub}>GOOD DAY,</Text>
                        <Text style={[s.greetName, { fontFamily: 'Orbitron-Bold' }]}>
                            {user?.name?.toUpperCase() || 'ATHLETE'}
                        </Text>
                    </View>
                    <View style={[s.goalChip, { borderColor: NEON }]}>
                        <Text style={[s.goalChipText, { fontFamily: 'Orbitron' }]}>
                            {GOAL_LABELS[user?.fitness_goal] || '—'}
                        </Text>
                    </View>
                </MotiView>

                {/* ── BMI / Stats Card ── */}
                <FloatInCard delay={80}>
                    <GlassCard glowColor="green" float floatDelay={0}>
                        <Text style={[s.cardLabel, { fontFamily: 'Orbitron' }]}>BIOMETRICS</Text>
                        <View style={s.statsRow}>
                            <Stat value={bmi ?? '--'} unit="" label="BMI" />
                            <View style={s.divider} />
                            <Stat value={user?.height_cm ?? '--'} unit="cm" label="HEIGHT" />
                            <View style={s.divider} />
                            <Stat value={user?.weight_kg ?? '--'} unit="kg" label="MASS" />
                            <View style={s.divider} />
                            <Stat value={user?.age ?? '--'} unit="yr" label="AGE" />
                        </View>
                        {bmi && (
                            <Text style={s.bmiCatText}>
                                STATUS: <Text style={{ color: NEON }}>{bmiCat(parseFloat(bmi)).toUpperCase()}</Text>
                            </Text>
                        )}
                    </GlassCard>
                </FloatInCard>

                {/* ── Wearable Card ── */}
                <FloatInCard delay={160}>
                    <GlassCard glowColor={wearableOk ? 'blue' : 'none'} float floatDelay={400} intensity={40}>
                        <View style={s.cardHeader}>
                            <View style={s.cardHeaderLeft}>
                                {wearableOk && (
                                    <MotiView
                                        from={{ opacity: 1, scale: 1 }}
                                        animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
                                        transition={{ type: 'timing', duration: 1000, loop: true }}
                                        style={[s.pulseDot, { backgroundColor: BLUE }]}
                                    />
                                )}
                                <Text style={[s.cardLabel, { fontFamily: 'Orbitron', color: wearableOk ? BLUE : 'rgba(255,255,255,0.4)' }]}>
                                    WEARABLE_LINK
                                </Text>
                            </View>
                            <Animated.View style={syncBtnStyle}>
                                <Pressable
                                    style={[s.syncBtn, { borderColor: wearableOk ? BLUE : 'rgba(255,255,255,0.2)' }]}
                                    disabled={syncing}
                                    onPress={syncVitals}
                                    onPressIn={() => { syncScale.value = withTiming(0.94, { duration: 80 }); }}
                                    onPressOut={() => { syncScale.value = withTiming(1,    { duration: 150 }); }}
                                >
                                    {syncing
                                        ? <ActivityIndicator color={BLUE} size={12} />
                                        : <Text style={[s.syncTxt, { color: wearableOk ? BLUE : 'rgba(255,255,255,0.3)', fontFamily: MONO }]}>SYNC</Text>}
                                </Pressable>
                            </Animated.View>
                        </View>

                        {wearableOk ? (
                            <View style={s.hrWrap}>
                                <Text style={[s.hrValue, { fontFamily: 'Orbitron-Bold', color: BLUE }]}>
                                    {heartRate ?? '--'}
                                </Text>
                                <Text style={[s.hrUnit, { color: BLUE }]}> BPM</Text>
                            </View>
                        ) : (
                            <Text style={s.lockedTxt}>Health Connect vault locked or unavailable.</Text>
                        )}
                    </GlassCard>
                </FloatInCard>

                {/* ── Energy Intake Card ── */}
                <FloatInCard delay={240}>
                    <GlassCard glowColor="blue" float floatDelay={800} intensity={30}>
                        <View style={s.cardHeader}>
                            <Text style={[s.cardLabel, { fontFamily: 'Orbitron', color: BLUE }]}>ENERGY INTAKE</Text>
                            <Pressable
                                style={[s.syncBtn, { borderColor: BLUE }]}
                                onPress={() => navigation.navigate('LogFood')}
                            >
                                <Text style={[s.syncTxt, { color: BLUE, fontFamily: MONO }]}>+ LOG</Text>
                            </Pressable>
                        </View>
                        <GlassBar
                            pct={calPct}
                            color={BLUE}
                            label="CALORIES"
                            value={`${nutrition?.total_calories ?? 0} / ${nutrition?.calorie_goal ?? 2500} kcal`}
                        />
                        <GlassBar
                            pct={proPct}
                            color={NEON}
                            label="PROTEIN"
                            value={`${nutrition?.total_protein ?? 0} / ${nutrition?.protein_goal ?? 150} g`}
                        />
                        {nutrition && (
                            <Text style={s.itemsLogged}>
                                {nutrition.items_logged} item{nutrition.items_logged !== 1 ? 's' : ''} logged today
                            </Text>
                        )}
                    </GlassCard>
                </FloatInCard>

                {/* ── AI Knowledge Card ── */}
                <FloatInCard delay={320}>
                    <GlassCard glowColor="green" intensity={25}>
                        <Text style={[s.cardLabel, { fontFamily: 'Orbitron' }]}>AI DAILY KNOWLEDGE</Text>
                        {insightsLoading
                            ? <ActivityIndicator color={NEON} style={{ marginTop: 8 }} />
                            : <Text style={s.factText}>{fact}</Text>}
                    </GlassCard>
                </FloatInCard>

                {/* ── Programme Summary Card ── */}
                <FloatInCard delay={400}>
                    <GlassCard glowColor="none" intensity={20}>
                        <Text style={[s.cardLabel, { fontFamily: 'Orbitron' }]}>CURRENT PROGRAMME</Text>
                        {[
                            ['GOAL',     GOAL_LABELS[user?.fitness_goal]  || '—'],
                            ['ACTIVITY', user?.activity_level?.toUpperCase() || '—'],
                            ['GENDER',   user?.gender?.toUpperCase()       || '—'],
                        ].map(([label, val]) => (
                            <View key={label} style={s.progRow}>
                                <Text style={[s.progLabel, { fontFamily: MONO }]}>{label}</Text>
                                <Text style={s.progValue}>{val}</Text>
                            </View>
                        ))}
                    </GlassCard>
                </FloatInCard>

                <View style={{ height: 40 }} />
            </Animated.ScrollView>

            {/* ── Blurred Header (stays on top) ── */}
            <BlurHeader scrollY={scrollY} navigation={navigation} />
        </View>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    scroll: { paddingTop: HEADER_H + 16, paddingHorizontal: 16, paddingBottom: 24 },

    // Quote
    quoteCard: { marginBottom: 0 },
    quoteText: { color: '#fff', fontStyle: 'italic', fontSize: 14, lineHeight: 22, textAlign: 'center', opacity: 0.9 },

    // Greeting
    greetRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 4, paddingHorizontal: 4 },
    greetSub:  { color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    greetName: { color: '#fff', fontSize: 22, letterSpacing: 2, marginTop: 2, textShadowColor: NEON, textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } },
    goalChip:  { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(57,255,20,0.08)' },
    goalChipText: { color: NEON, fontSize: 10, letterSpacing: 1 },

    // Card internals
    cardLabel:  { color: NEON, fontSize: 10, letterSpacing: 3, marginBottom: 14, opacity: 0.9 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    // Stats row
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    divider:  { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.1)' },
    bmiCatText: { color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 4 },

    // Wearable
    pulseDot: { width: 8, height: 8, borderRadius: 4, shadowColor: BLUE, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
    hrWrap:   { flexDirection: 'row', alignItems: 'flex-end' },
    hrValue:  { fontSize: 52, letterSpacing: 2, lineHeight: 58 },
    hrUnit:   { fontSize: 18, fontWeight: '700', marginBottom: 8, opacity: 0.8 },
    lockedTxt:{ color: 'rgba(255,255,255,0.3)', fontSize: 12, fontStyle: 'italic', lineHeight: 18 },

    // Sync button
    syncBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.05)', minWidth: 64, alignItems: 'center' },
    syncTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },

    // AI fact
    factText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 20 },

    // Programme
    progRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
    progLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: 2 },
    progValue: { color: '#fff', fontSize: 13, fontWeight: '600' },

    // Nutrition
    itemsLogged: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontStyle: 'italic', marginTop: 4 },
});

export default HomeScreen;
