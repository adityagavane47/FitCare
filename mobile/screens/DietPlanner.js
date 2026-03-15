import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator, Alert, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';
import CustomHeader from '../components/CustomHeader';
import useInteractionReady from '../hooks/useInteractionReady';

const { width } = Dimensions.get('window');

const DietPlanner = ({ route }) => {
    const { userId } = route.params;
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [macroOverride, setMacroOverride] = useState(null);

    // Wait for screen transition animation to finish before fetching
    const isReady = useInteractionReady();

    useEffect(() => {
        if (!isReady) return;
        fitcareAPI.getNutritionPlan(userId)
            .then(setPlan)
            .catch(() => { }) // No plan yet — that's fine
            .finally(() => setFetching(false));
    }, [isReady, userId]);

    // Read dynamic macro override from workout logger
    useEffect(() => {
        const loadMacroOverride = async () => {
            try {
                const stored = await AsyncStorage.getItem('@daily_macro_override');
                if (stored) {
                    setMacroOverride(JSON.parse(stored));
                }
            } catch (e) {
                console.log('Failed to read macro override:', e);
            }
        };
        loadMacroOverride();
    }, []);

    const generatePlan = async () => {
        setLoading(true);
        try {
            const newPlan = await fitcareAPI.generateNutritionPlan(userId);
            setPlan(newPlan);
        } catch (err) {
            Alert.alert('Error', err.message || 'Could not generate plan. Complete your profile first.');
        } finally {
            setLoading(false);
        }
    };

    const MacroBar = ({ label, value, total, color }) => {
        const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
        return (
            <View style={styles.macroItem}>
                <View style={styles.macroHeader}>
                    <Text style={styles.macroLabel}>{label}</Text>
                    <Text style={[styles.macroValue, { color }]}>{value}g</Text>
                </View>
                <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                </View>
            </View>
        );
    };

    if (!isReady || fetching) {
        return <View style={styles.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>;
    }

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <CustomHeader title="Nutrition" />

            <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>🥗 DIET_SYNC</Text>
                <Text style={styles.pageSubtitle}>Personalised via Mifflin-St Jeor engine</Text>
            </View>

            {/* Dynamic Macro Override Banner */}
            {macroOverride && (
                <View style={styles.overrideBanner}>
                    <Text style={styles.overrideBannerTitle}>DYNAMIC MACRO ADJUSTMENT ACTIVE</Text>
                    <View style={styles.overrideMacros}>
                        <View style={styles.overrideMacroItem}>
                            <Text style={styles.overrideMacroValue}>+{macroOverride.extra_protein_g}g</Text>
                            <Text style={styles.overrideMacroLabel}>PROTEIN</Text>
                        </View>
                        <View style={styles.overrideDivider} />
                        <View style={styles.overrideMacroItem}>
                            <Text style={styles.overrideMacroValue}>+{macroOverride.extra_carbs_g}g</Text>
                            <Text style={styles.overrideMacroLabel}>CARBS</Text>
                        </View>
                    </View>
                </View>
            )}

            {plan ? (
                <>
                    {/* Calorie Cards */}
                    <View style={styles.calorieRow}>
                        <View style={styles.calorieCard}>
                            <Text style={styles.calorieVal}>{Math.round(plan.bmr)}</Text>
                            <Text style={styles.calorieLabel}>BMR</Text>
                            <Text style={styles.calorieHint}>Base metabolic rate</Text>
                        </View>
                        <View style={styles.calorieCard}>
                            <Text style={styles.calorieVal}>{Math.round(plan.tdee)}</Text>
                            <Text style={styles.calorieLabel}>TDEE</Text>
                            <Text style={styles.calorieHint}>With activity</Text>
                        </View>
                    </View>

                    {/* Target Calories */}
                    <View style={styles.targetCard}>
                        <Text style={styles.targetLabel}>🎯 Daily Target</Text>
                        <Text style={styles.targetValue}>{Math.round(plan.target_calories)}</Text>
                        <Text style={styles.targetUnit}>kcal / day</Text>
                    </View>

                    {/* Macro Breakdown */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Macro Breakdown</Text>
                        <MacroBar label="Protein" value={Math.round(plan.protein_g)} total={300} color={Colors.primary} />
                        <MacroBar label="Carbohydrates" value={Math.round(plan.carbs_g)} total={500} color="#3B82F6" />
                        <MacroBar label="Fats" value={Math.round(plan.fat_g)} total={150} color={Colors.warning} />

                        <View style={styles.macroKcalRow}>
                            <Text style={styles.macroKcalItem}>🥩 {Math.round(plan.protein_g * 4)} kcal from Protein</Text>
                            <Text style={styles.macroKcalItem}>🍞 {Math.round(plan.carbs_g * 4)} kcal from Carbs</Text>
                            <Text style={styles.macroKcalItem}>🫒 {Math.round(plan.fat_g * 9)} kcal from Fats</Text>
                        </View>
                    </View>

                    {/* Meal Timing Guide */}
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>⏰ Meal Timing Guide</Text>
                        {[
                            { meal: 'Breakfast', pct: '25%', icon: '🌅' },
                            { meal: 'Lunch', pct: '35%', icon: '☀️' },
                            { meal: 'Snack', pct: '10%', icon: '🍎' },
                            { meal: 'Dinner', pct: '30%', icon: '🌙' },
                        ].map((m) => (
                            <View key={m.meal} style={styles.mealRow}>
                                <Text style={styles.mealIcon}>{m.icon}</Text>
                                <Text style={styles.mealName}>{m.meal}</Text>
                                <Text style={styles.mealPct}>{m.pct}</Text>
                                <Text style={styles.mealKcal}>
                                    ~{Math.round(plan.target_calories * parseFloat(m.pct) / 100)} kcal
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* AI Meal Plan Guide (Ollama Phi-3) */}
                    {plan.ai_meal_plan ? (
                        <View style={styles.aiCard}>
                            <View style={styles.aiHeader}>
                                <Text style={styles.aiTitle}>🤖 AI Sample Meal Plan</Text>
                                <Text style={styles.aiBadge}>Phi-3</Text>
                            </View>
                            <Text style={styles.aiContent}>{plan.ai_meal_plan}</Text>
                        </View>
                    ) : null}

                    <TouchableOpacity style={styles.regenBtn} onPress={generatePlan} disabled={loading}>
                        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.regenBtnText}>♻️ Recalculate Plan</Text>}
                    </TouchableOpacity>
                </>
            ) : (
                <View style={styles.emptyCard}>
                    <Text style={styles.emptyIcon}>🥗</Text>
                    <Text style={styles.emptyTitle}>No Plan Yet</Text>
                    <Text style={styles.emptyDesc}>
                        Generate your personalised calorie and macro targets based on your profile.
                    </Text>
                    <TouchableOpacity style={styles.generateBtn} onPress={generatePlan} disabled={loading}>
                        {loading ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <Text style={styles.generateBtnText}>Generate My Plan →</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
            <View style={{ height: 20 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
    pageHeader: { paddingHorizontal: 16, marginTop: 20, marginBottom: 20 },
    pageTitle: { color: Colors.text, fontSize: 24, fontWeight: '800' },
    pageSubtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },

    // Dynamic Macro Override Banner
    overrideBanner: {
        backgroundColor: 'rgba(57, 255, 20, 0.08)',
        borderWidth: 1.5,
        borderColor: '#39FF14',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#39FF14',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 8,
    },
    overrideBannerTitle: {
        color: '#39FF14',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 3,
        textAlign: 'center',
        marginBottom: 12,
        textShadowColor: '#39FF14',
        textShadowRadius: 8,
    },
    overrideMacros: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    overrideMacroItem: { alignItems: 'center', flex: 1 },
    overrideMacroValue: { color: '#39FF14', fontSize: 28, fontWeight: '900', textShadowColor: '#39FF14', textShadowRadius: 10 },
    overrideMacroLabel: { color: '#39FF14', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: 4, opacity: 0.7 },
    overrideDivider: { width: 1, height: 40, backgroundColor: 'rgba(57, 255, 20, 0.3)' },

    calorieRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    calorieCard: {
        flex: 1, backgroundColor: Colors.card, borderWidth: 1,
        borderColor: Colors.border, borderRadius: 16, padding: 16, alignItems: 'center',
    },
    calorieVal: { color: Colors.primary, fontSize: 28, fontWeight: '900' },
    calorieLabel: { color: Colors.text, fontWeight: '700', fontSize: 14, marginTop: 4 },
    calorieHint: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

    targetCard: {
        backgroundColor: Colors.primaryDim, borderWidth: 2, borderColor: Colors.primary,
        borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 12,
    },
    targetLabel: { color: Colors.primary, fontWeight: '700', fontSize: 14, marginBottom: 4 },
    targetValue: { color: Colors.primary, fontSize: 56, fontWeight: '900' },
    targetUnit: { color: Colors.textMuted, fontSize: 14 },

    card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, marginBottom: 12 },
    cardTitle: { color: Colors.primary, fontWeight: '700', fontSize: 14, marginBottom: 16 },

    macroItem: { marginBottom: 14 },
    macroHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    macroLabel: { color: Colors.textMuted, fontSize: 13 },
    macroValue: { fontWeight: '700', fontSize: 13 },
    barBg: { height: 8, backgroundColor: '#1A1A1A', borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
    macroKcalRow: { marginTop: 10, gap: 4 },
    macroKcalItem: { color: Colors.textDim, fontSize: 12 },

    mealRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
    mealIcon: { fontSize: 18 },
    mealName: { flex: 1, color: Colors.text, fontSize: 14 },
    mealPct: { color: Colors.textMuted, fontSize: 12, width: 36 },
    mealKcal: { color: Colors.primary, fontWeight: '700', fontSize: 12 },

    aiCard: { backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#333', borderRadius: 16, padding: 16, marginBottom: 12 },
    aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    aiTitle: { color: Colors.primary, fontWeight: '800', fontSize: 16 },
    aiBadge: { backgroundColor: Colors.primaryDim, color: Colors.primary, fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
    aiContent: { color: Colors.text, fontSize: 14, lineHeight: 22 },

    regenBtn: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 },
    regenBtnText: { color: Colors.textMuted, fontWeight: '600' },

    emptyCard: {
        backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 16, padding: 32, alignItems: 'center', marginTop: 40,
    },
    emptyIcon: { fontSize: 48, marginBottom: 16 },
    emptyTitle: { color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
    emptyDesc: { color: Colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    generateBtn: { backgroundColor: Colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
    generateBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
});

export default DietPlanner;
