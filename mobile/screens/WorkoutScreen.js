import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Alert, ActivityIndicator
} from 'react-native';
import { Colors } from '../constants/Colors';
import {
    connectBluetooth, startHeartRateStream,
    stopHeartRateStream, sendWorkoutToBackend
} from '../services/wearable';

const EXERCISE_TYPES = [
    { value: 'general', label: 'General', icon: '🏋️' },
    { value: 'running', label: 'Running', icon: '🏃' },
    { value: 'cycling', label: 'Cycling', icon: '🚴' },
    { value: 'yoga', label: 'Yoga', icon: '🧘' },
    { value: 'boxing', label: 'Boxing', icon: '🥊' },
    { value: 'swimming', label: 'Swimming', icon: '🏊' },
];

const WorkoutScreen = ({ route, navigation }) => {
    const { userId } = route.params;
    const [selectedType, setSelectedType] = useState('general');
    const [connected, setConnected] = useState(false);
    const [active, setActive] = useState(false);
    const [heartRate, setHeartRate] = useState(null);
    const [heartRateMax, setHeartRateMax] = useState(0);
    const [heartRates, setHeartRates] = useState([]);
    const [elapsed, setElapsed] = useState(0);
    const [saving, setSaving] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => {
            stopHeartRateStream();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const handleConnect = async () => {
        const result = await connectBluetooth();
        setConnected(result.connected);
    };

    const handleStart = async () => {
        if (!connected) await handleConnect();
        setActive(true);
        setElapsed(0);
        setHeartRates([]);
        setHeartRateMax(0);

        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

        startHeartRateStream(({ heartRate: hr }) => {
            setHeartRate(hr);
            setHeartRates((prev) => {
                const updated = [...prev, hr];
                setHeartRateMax((m) => Math.max(m, hr));
                return updated;
            });
        });
    };

    const handleStop = async () => {
        setActive(false);
        stopHeartRateStream();
        if (timerRef.current) clearInterval(timerRef.current);

        if (elapsed < 10) {
            Alert.alert('Too short', 'Workout too short to log. Minimum 10 seconds.');
            setElapsed(0);
            return;
        }

        const avgHR = heartRates.length > 0
            ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
            : null;

        setSaving(true);
        try {
            await sendWorkoutToBackend(userId, selectedType, elapsed / 60, avgHR, heartRateMax);
            Alert.alert('Workout Logged! 💪', `${Math.round(elapsed / 60)} min ${selectedType} session saved.`);
        } catch (err) {
            Alert.alert('Save Error', 'Could not log workout. Check backend connection.');
        } finally {
            setSaving(false);
            setElapsed(0);
            setHeartRate(null);
        }
    };

    const formatTime = (s) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    const hrZoneColor = () => {
        if (!heartRate) return Colors.textDim;
        if (heartRate < 100) return '#3B82F6';
        if (heartRate < 130) return Colors.primary;
        if (heartRate < 160) return Colors.warning;
        return Colors.danger;
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>⚡ Workout</Text>
                <View style={[styles.statusDot, { backgroundColor: connected ? Colors.primary : Colors.textDim }]} />
            </View>

            {/* Exercise Type Selector */}
            <Text style={styles.sectionLabel}>Select Exercise</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                {EXERCISE_TYPES.map((t) => (
                    <TouchableOpacity
                        key={t.value}
                        style={[styles.typeChip, selectedType === t.value && styles.typeChipSelected]}
                        onPress={() => !active && setSelectedType(t.value)}
                        disabled={active}
                    >
                        <Text style={styles.typeIcon}>{t.icon}</Text>
                        <Text style={[styles.typeLabel, selectedType === t.value && styles.typeLabelSelected]}>
                            {t.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Timer Display */}
            <View style={styles.timerCard}>
                <Text style={styles.timerLabel}>Elapsed Time</Text>
                <Text style={[styles.timer, active && styles.timerActive]}>{formatTime(elapsed)}</Text>

                {/* Heart Rate Display */}
                <View style={styles.hrDisplay}>
                    <Text style={[styles.hrValue, { color: hrZoneColor() }]}>
                        {heartRate ?? '—'}
                    </Text>
                    <Text style={styles.hrUnit}>bpm</Text>
                </View>

                {heartRateMax > 0 && (
                    <Text style={styles.hrMax}>Peak: {heartRateMax} bpm</Text>
                )}
            </View>

            {/* HR Zone Guide */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>❤️ Heart Rate Zones</Text>
                {[
                    { zone: 'Rest', range: '< 100', color: '#3B82F6' },
                    { zone: 'Fat Burn', range: '100–130', color: Colors.primary },
                    { zone: 'Cardio', range: '130–160', color: Colors.warning },
                    { zone: 'Peak', range: '> 160', color: Colors.danger },
                ].map((z) => (
                    <View key={z.zone} style={styles.zoneRow}>
                        <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                        <Text style={styles.zoneName}>{z.zone}</Text>
                        <Text style={styles.zoneRange}>{z.range} bpm</Text>
                    </View>
                ))}
            </View>

            {/* Action Buttons */}
            {saving ? (
                <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
            ) : (
                <>
                    {!active ? (
                        <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
                            <Text style={styles.startBtnText}>▶ Start Workout</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
                            <Text style={styles.stopBtnText}>⏹ Stop & Save</Text>
                        </TouchableOpacity>
                    )}
                </>
            )}

            {!connected && !active && (
                <TouchableOpacity style={styles.connectBtn} onPress={handleConnect}>
                    <Text style={styles.connectBtnText}>📡 Connect Wearable</Text>
                </TouchableOpacity>
            )}

            {!active && (selectedType === 'general' || selectedType === 'yoga') && (
                <TouchableOpacity
                    style={[styles.connectBtn, { marginTop: 12, borderColor: Colors.primary }]}
                    onPress={() => navigation.navigate('FormCorrection', { userId, exerciseType: selectedType === 'general' ? 'pushup' : 'squat' })}
                >
                    <Text style={[styles.connectBtnText, { color: Colors.primary }]}>📸 Let AI Coach Watch Form</Text>
                </TouchableOpacity>
            )}

            <View style={{ height: 30 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background, padding: 16 },
    pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 48, marginBottom: 20 },
    pageTitle: { color: Colors.text, fontSize: 24, fontWeight: '800' },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    sectionLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    typeScroll: { marginBottom: 20 },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10 },
    typeChipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
    typeIcon: { fontSize: 16 },
    typeLabel: { color: Colors.textMuted, fontWeight: '600' },
    typeLabelSelected: { color: Colors.primary },
    timerCard: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 16 },
    timerLabel: { color: Colors.textMuted, fontSize: 12, marginBottom: 8 },
    timer: { color: Colors.text, fontSize: 64, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timerActive: { color: Colors.primary, textShadowColor: Colors.primaryGlow, textShadowRadius: 12 },
    hrDisplay: { flexDirection: 'row', alignItems: 'baseline', marginTop: 16, gap: 6 },
    hrValue: { fontSize: 48, fontWeight: '900' },
    hrUnit: { color: Colors.textMuted, fontSize: 16 },
    hrMax: { color: Colors.danger, fontSize: 12, marginTop: 4 },
    card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 16, padding: 16, marginBottom: 12 },
    cardTitle: { color: Colors.primary, fontWeight: '700', fontSize: 14, marginBottom: 12 },
    zoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
    zoneDot: { width: 10, height: 10, borderRadius: 5 },
    zoneName: { flex: 1, color: Colors.text, fontSize: 14 },
    zoneRange: { color: Colors.textMuted, fontSize: 13 },
    startBtn: { backgroundColor: Colors.primary, borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
    startBtnText: { color: '#000', fontWeight: '800', fontSize: 18 },
    stopBtn: { backgroundColor: Colors.danger, borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
    stopBtnText: { color: '#fff', fontWeight: '800', fontSize: 18 },
    connectBtn: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, alignItems: 'center' },
    connectBtnText: { color: Colors.textMuted, fontWeight: '600' },
});

export default WorkoutScreen;
