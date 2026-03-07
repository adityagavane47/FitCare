import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity
} from 'react-native';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';
import CustomHeader from '../components/CustomHeader';

const EXERCISE_ICONS = { general: '🏋️', running: '🏃', cycling: '🚴', swimming: '🏊', yoga: '🧘', boxing: '🥊' };

const ProgressDashboard = ({ route }) => {
    const { userId } = route.params;
    const [history, setHistory] = useState([]);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [hData, uData] = await Promise.all([
                fitcareAPI.getWorkoutHistory(userId).catch(() => []),
                fitcareAPI.getUser(userId).catch(() => null)
            ]);
            setHistory(hData);
            setUser(uData);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [userId]);

    // Derive summary stats from history
    const totalWorkouts = history.length;
    const totalMinutes = history.reduce((s, w) => s + w.duration_minutes, 0);
    const totalCalories = history.reduce((s, w) => s + (w.calories_burned || 0), 0);
    const avgHR = history.length > 0
        ? Math.round(history.reduce((s, w) => s + (w.heart_rate_avg || 0), 0) / history.length)
        : 0;

    // Build a simple 7-day bar chart from raw data
    const barData = (() => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const counts = new Array(7).fill(0);
        history.slice(0, 30).forEach((log) => {
            const d = new Date(log.logged_at).getDay();
            counts[d]++;
        });
        const max = Math.max(...counts, 1);
        return days.map((label, i) => ({ label, count: counts[i], pct: counts[i] / max }));
    })();

    if (loading) {
        return <View style={styles.centered}><ActivityIndicator color={Colors.primary} size="large" /></View>;
    }

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <CustomHeader title="Progress" />

            <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>STATS_UPLINK</Text>
                <TouchableOpacity onPress={fetchData}>
                    <Text style={styles.refreshBtn}>↻ REFRESH</Text>
                </TouchableOpacity>
            </View>

            {/* Weight Progress (Mock Target for Visual) */}
            {user && user.weight_kg && (
                <View style={[styles.card, styles.weightCard]}>
                    <Text style={styles.cardTitle}>⚖️ Weight Progress</Text>
                    <View style={styles.weightRow}>
                        <View style={styles.weightCol}>
                            <Text style={styles.weightLabel}>Current</Text>
                            <Text style={styles.weightValue}>{user.weight_kg} kg</Text>
                        </View>
                        <View style={styles.weightDivider} />
                        <View style={styles.weightCol}>
                            <Text style={styles.weightLabel}>Goal ({user.fitness_goal})</Text>
                            <Text style={styles.weightValue}>
                                {user.fitness_goal === 'lose' ? user.weight_kg - 5 : user.fitness_goal === 'gain' ? user.weight_kg + 5 : user.weight_kg} kg
                            </Text>
                        </View>
                    </View>
                    <View style={styles.weightBarBg}>
                        <View style={[styles.weightBarFill, { width: user.fitness_goal === 'lose' ? '60%' : '100%', backgroundColor: Colors.primary }]} />
                    </View>
                </View>
            )}

            {/* Summary Stats */}
            <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{totalWorkouts}</Text>
                    <Text style={styles.statLabel}>Workouts</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{Math.round(totalMinutes)}</Text>
                    <Text style={styles.statLabel}>Minutes</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{Math.round(totalCalories)}</Text>
                    <Text style={styles.statLabel}>Calories</Text>
                </View>
                <View style={styles.statCard}>
                    <Text style={styles.statValue}>{avgHR || '—'}</Text>
                    <Text style={styles.statLabel}>Avg HR</Text>
                </View>
            </View>

            {/* Weekly Bar Chart */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>📅 Weekly Activity</Text>
                <View style={styles.chart}>
                    {barData.map((d) => (
                        <View key={d.label} style={styles.chartCol}>
                            <View style={styles.chartBarBg}>
                                <View style={[styles.chartBar, { height: `${Math.max(d.pct * 100, d.count > 0 ? 10 : 0)}%` }]} />
                            </View>
                            <Text style={styles.chartLabel}>{d.label}</Text>
                            {d.count > 0 && <Text style={styles.chartCount}>{d.count}</Text>}
                        </View>
                    ))}
                </View>
            </View>

            {/* Workout History */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>🗂 Workout History</Text>
                {history.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🏃</Text>
                        <Text style={styles.emptyText}>No workouts logged yet.</Text>
                        <Text style={styles.emptyHint}>Head to the Workout tab to start your first session.</Text>
                    </View>
                ) : (
                    history.map((log) => (
                        <View key={log.id} style={styles.logCard}>
                            <Text style={styles.logIcon}>
                                {EXERCISE_ICONS[log.exercise_type] || '🏋️'}
                            </Text>
                            <View style={styles.logInfo}>
                                <Text style={styles.logType}>{log.exercise_type}</Text>
                                <Text style={styles.logDate}>
                                    {new Date(log.logged_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </Text>
                            </View>
                            <View style={styles.logStats}>
                                <Text style={styles.logStat}>{log.duration_minutes} min</Text>
                                {log.heart_rate_avg && <Text style={styles.logHR}>❤️ {log.heart_rate_avg} bpm</Text>}
                                {log.calories_burned && <Text style={styles.logCal}>🔥 {Math.round(log.calories_burned)} kcal</Text>}
                            </View>
                        </View>
                    ))
                )}
            </View>
            <View style={{ height: 20 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
    pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 20, marginBottom: 20 },
    pageTitle: { color: Colors.text, fontSize: 24, fontWeight: '800' },
    refreshBtn: { color: Colors.primary, fontWeight: '600' },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    statCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 14, alignItems: 'center' },
    statValue: { color: Colors.primary, fontSize: 24, fontWeight: '900' },
    statLabel: { color: Colors.textMuted, fontSize: 11, marginTop: 4 },
    card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, marginBottom: 12 },
    cardTitle: { color: Colors.primary, fontWeight: '700', fontSize: 14, marginBottom: 16 },

    weightCard: { borderColor: Colors.primary, borderWidth: 1 },
    weightRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 16 },
    weightCol: { alignItems: 'center' },
    weightLabel: { color: Colors.textMuted, fontSize: 12, marginBottom: 4 },
    weightValue: { color: Colors.text, fontSize: 24, fontWeight: '900' },
    weightDivider: { width: 1, height: 30, backgroundColor: Colors.border },
    weightBarBg: { height: 8, backgroundColor: '#1A1A1A', borderRadius: 4, overflow: 'hidden' },
    weightBarFill: { height: '100%', borderRadius: 4 },

    chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 100 },
    chartCol: { flex: 1, alignItems: 'center' },
    chartBarBg: { width: 20, height: 80, backgroundColor: '#1A1A1A', borderRadius: 4, justifyContent: 'flex-end', marginBottom: 4 },
    chartBar: { width: '100%', backgroundColor: Colors.primary, borderRadius: 4, minHeight: 0 },
    chartLabel: { color: Colors.textDim, fontSize: 9 },
    chartCount: { color: Colors.primary, fontSize: 10, fontWeight: '700' },
    emptyState: { alignItems: 'center', paddingVertical: 24 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: { color: Colors.text, fontWeight: '600', marginBottom: 4 },
    emptyHint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center' },
    logCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 12 },
    logIcon: { fontSize: 24 },
    logInfo: { flex: 1 },
    logType: { color: Colors.text, fontWeight: '600', textTransform: 'capitalize' },
    logDate: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
    logStats: { alignItems: 'flex-end', gap: 2 },
    logStat: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
    logHR: { color: Colors.danger, fontSize: 11 },
    logCal: { color: Colors.warning, fontSize: 11 },
});

export default ProgressDashboard;
