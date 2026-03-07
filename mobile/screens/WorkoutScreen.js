import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Alert, ActivityIndicator, Dimensions
} from 'react-native';
import { Colors } from '../constants/Colors';
import { sendWorkoutToBackend } from '../services/wearable';
import CustomHeader from '../components/CustomHeader';

const { width } = Dimensions.get('window');

const CATEGORIES = {
    'Strength': ['Dumbbells', 'Barbell', 'Bodyweight', 'Machines'],
    'Cardio': ['Treadmill', 'Cycling', 'Elliptical', 'Rowing', 'Running'],
    'Yoga': ['Hatha', 'Vinyasa', 'Ashtanga', 'Restorative'],
    'Combat': ['Boxing', 'Kickboxing', 'MMA'],
};

const WorkoutScreen = ({ route }) => {
    const { userId } = route.params || { userId: 1 };

    // Selection State
    const [selectedCategory, setSelectedCategory] = useState('Strength');
    const [selectedExercise, setSelectedExercise] = useState('Dumbbells');

    // Timer State
    const [timer, setTimer] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [saving, setSaving] = useState(false);

    const intervalRef = useRef(null);

    useEffect(() => {
        if (isActive) {
            intervalRef.current = setInterval(() => {
                setTimer((t) => t + 1);
            }, 1000);
        } else {
            clearInterval(intervalRef.current);
        }
        return () => clearInterval(intervalRef.current);
    }, [isActive]);

    const handleStartStop = async () => {
        if (isActive) {
            // Stop and Save
            setIsActive(false);
            if (timer < 5) {
                Alert.alert('Protocol Error', 'Session too short for uplink. (Min 5s)');
                setTimer(0);
                return;
            }
            saveWorkout();
        } else {
            // Start
            setIsActive(true);
        }
    };

    const saveWorkout = async () => {
        setSaving(true);
        try {
            const durationMin = timer / 60;
            await sendWorkoutToBackend(
                userId,
                selectedExercise.toLowerCase(),
                durationMin,
                null, // No wearable HR for manual log
                null,
                selectedCategory,
                selectedExercise
            );
            Alert.alert('UPLINK_SUCCESS', `Protocol [${selectedExercise}] synced successfully.`);
            setTimer(0);
        } catch (error) {
            Alert.alert('UPLINK_FAILED', 'Connection to core lost. Check backend status.');
        } finally {
            setSaving(false);
        }
    };

    const formatTime = (s) => {
        const m = Math.floor(s / 60).toString().padStart(2, '0');
        const sec = (s % 60).toString().padStart(2, '0');
        return `${m}:${sec}`;
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <CustomHeader title="Manual Sync" />

            <View style={styles.header}>
                <Text style={styles.headerTitle}>V2.0_UPLINK</Text>
                <View style={[styles.statusDot, { backgroundColor: isActive ? '#39FF14' : '#555' }]} />
            </View>

            {/* Category Selector */}
            <Text style={styles.label}>SELECT_CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                {Object.keys(CATEGORIES).map((cat) => (
                    <TouchableOpacity
                        key={cat}
                        style={[styles.pill, selectedCategory === cat && styles.pillActive]}
                        onPress={() => {
                            if (!isActive) {
                                setSelectedCategory(cat);
                                setSelectedExercise(CATEGORIES[cat][0]);
                            }
                        }}
                    >
                        <Text style={[styles.pillText, selectedCategory === cat && styles.pillTextActive]}>{cat.toUpperCase()}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Exercise Selector */}
            <Text style={styles.label}>SELECT_EXERCISE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                {CATEGORIES[selectedCategory].map((ex) => (
                    <TouchableOpacity
                        key={ex}
                        style={[styles.smallPill, selectedExercise === ex && styles.smallPillActive]}
                        onPress={() => !isActive && setSelectedExercise(ex)}
                    >
                        <Text style={[styles.smallPillText, selectedExercise === ex && styles.smallPillTextActive]}>{ex}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Stopwatch Display */}
            <View style={styles.timerContainer}>
                <Text style={styles.timerLabel}>SESSION_ELAPSED</Text>
                <Text style={[styles.timerText, isActive && styles.timerTextActive]}>{formatTime(timer)}</Text>

                <View style={styles.glitchBox}>
                    <Text style={styles.glitchText}>PROTOCOL: {selectedExercise.toUpperCase()}</Text>
                </View>
            </View>

            {/* Main Action Button */}
            <View style={styles.actionSection}>
                {saving ? (
                    <ActivityIndicator color="#39FF14" size="large" />
                ) : (
                    <TouchableOpacity
                        style={[styles.mainBtn, isActive ? styles.stopBtn : styles.startBtn]}
                        onPress={handleStartStop}
                    >
                        <Text style={styles.mainBtnText}>
                            {isActive ? 'TERMINATE & SYNC' : 'INITIATE_WORKOUT'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.footerInfo}>
                <Text style={styles.footerText}>
                    {isActive ? 'SYSTEM_LOCKED: Timer active. Complete session to unlock selectors.' : 'BYPASS_ACTIVE: Selectors available for protocol adjustment.'}
                </Text>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    content: { paddingBottom: 50 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 25, marginTop: 30, marginBottom: 40 },
    headerTitle: { color: '#39FF14', fontSize: 22, fontWeight: '900', letterSpacing: 3 },
    statusDot: { width: 10, height: 10, borderRadius: 5, shadowColor: '#39FF14', shadowRadius: 10, shadowOpacity: 1 },
    label: { color: '#666', fontSize: 10, fontWeight: '800', marginBottom: 15, letterSpacing: 4 },
    pillScroll: { marginBottom: 30 },
    pill: { backgroundColor: '#1a1a1a', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 4, marginRight: 10, borderWidth: 1, borderColor: '#333' },
    pillActive: { borderColor: '#39FF14', backgroundColor: '#39FF1422' },
    pillText: { color: '#6d6d80', fontWeight: '800', fontSize: 12 },
    pillTextActive: { color: '#39FF14' },
    smallPill: { backgroundColor: '#1a1a1a', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 2, marginRight: 8, borderWidth: 1, borderColor: '#222' },
    smallPillActive: { borderColor: '#39FF14' },
    smallPillText: { color: '#555', fontWeight: '700', fontSize: 11 },
    smallPillTextActive: { color: '#FFF' },
    timerContainer: { backgroundColor: '#181818', borderRadius: 8, padding: 40, alignItems: 'center', marginBottom: 40, borderBottomWidth: 4, borderBottomColor: '#39FF14' },
    timerLabel: { color: '#39FF14', fontSize: 10, fontWeight: '900', letterSpacing: 5, marginBottom: 10, opacity: 0.7 },
    timerText: { color: '#FFF', fontSize: 84, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timerTextActive: { color: '#39FF14', textShadowColor: '#39FF14', textShadowRadius: 15 },
    glitchBox: { marginTop: 20, backgroundColor: '#000', paddingHorizontal: 15, paddingVertical: 5 },
    glitchText: { color: '#39FF14', fontSize: 12, fontWeight: '900' },
    actionSection: { alignItems: 'center' },
    mainBtn: { width: width - 50, padding: 20, borderRadius: 4, alignItems: 'center', borderWidth: 2 },
    startBtn: { borderColor: '#39FF14' },
    stopBtn: { borderColor: '#FF0042' },
    mainBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 5 },
    footerInfo: { marginTop: 30, opacity: 0.5 },
    footerText: { color: '#888', fontSize: 10, textAlign: 'center', fontWeight: 'bold' }
});

export default WorkoutScreen;
