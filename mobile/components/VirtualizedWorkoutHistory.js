import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Colors } from '../constants/Colors';

/**
 * VirtualizedWorkoutHistory — Drop-in FlashList replacement for FlatList
 *
 * This component replaces a `.map()` or `<FlatList>` for workout history
 * with Shopify's FlashList for buttery-smooth 60 FPS scrolling, even
 * with thousands of rows.
 *
 * Props:
 *   data - Array of workout log objects (same shape as ProgressDashboard)
 *
 * Key config:
 *   estimatedItemSize={72}
 *     Each workout row is roughly 72px tall (icon + 2 lines of text +
 *     vertical padding + 1px border). Measure your tallest row on-device
 *     and set this value accordingly. FlashList uses this hint to
 *     pre-allocate off-screen cells, minimising blank-space flicker.
 */

const EXERCISE_ICONS = {
    general: '🏋️', running: '🏃', cycling: '🚴',
    swimming: '🏊', yoga: '🧘', boxing: '🥊',
};

const WorkoutRow = ({ item }) => (
    <View style={styles.logCard}>
        <Text style={styles.logIcon}>
            {EXERCISE_ICONS[item.exercise_type] || '🏋️'}
        </Text>
        <View style={styles.logInfo}>
            <Text style={styles.logType}>{item.exercise_type}</Text>
            <Text style={styles.logDate}>
                {new Date(item.logged_at).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: '2-digit',
                })}
            </Text>
        </View>
        <View style={styles.logStats}>
            <Text style={styles.logStat}>{item.duration_minutes} min</Text>
            {item.heart_rate_avg && (
                <Text style={styles.logHR}>❤️ {item.heart_rate_avg} bpm</Text>
            )}
            {item.calories_burned && (
                <Text style={styles.logCal}>
                    🔥 {Math.round(item.calories_burned)} kcal
                </Text>
            )}
        </View>
    </View>
);

export default function VirtualizedWorkoutHistory({ data }) {
    if (!data || data.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🏃</Text>
                <Text style={styles.emptyText}>No workouts logged yet.</Text>
                <Text style={styles.emptyHint}>
                    Head to the Workout tab to start your first session.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.listContainer}>
            {/*
              FlashList REQUIRES a parent with a fixed height or flex: 1.
              Without it you get the "FlashList has 0px height" warning.
            */}
            <FlashList
                data={data}
                renderItem={({ item }) => <WorkoutRow item={item} />}
                keyExtractor={(item) => String(item.id)}
                estimatedItemSize={72}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    listContainer: {
        // Give FlashList a concrete height so it can virtualise.
        // Adjust this to taste, or use flex: 1 if the parent allows it.
        minHeight: 300,
    },
    logCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        gap: 12,
    },
    logIcon: { fontSize: 24 },
    logInfo: { flex: 1 },
    logType: {
        color: Colors.text,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    logDate: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
    logStats: { alignItems: 'flex-end', gap: 2 },
    logStat: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
    logHR: { color: Colors.danger, fontSize: 11 },
    logCal: { color: Colors.warning, fontSize: 11 },
    emptyState: { alignItems: 'center', paddingVertical: 24 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: {
        color: Colors.text,
        fontWeight: '600',
        marginBottom: 4,
    },
    emptyHint: {
        color: Colors.textMuted,
        fontSize: 12,
        textAlign: 'center',
    },
});
