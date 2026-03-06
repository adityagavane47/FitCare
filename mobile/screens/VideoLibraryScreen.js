import React, { useState } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity, FlatList
} from 'react-native';
import { Colors } from '../constants/Colors';

const BODY_PARTS = ['All', 'Chest', 'Back', 'Arms', 'Legs', 'Core', 'Shoulders', 'Cardio'];
const DIFFICULTIES = ['All', 'Beginner', 'Intermediate', 'Advanced'];

// Placeholder video library — replace with a real API (YouTube Data API / ExerciseDB)
const VIDEO_LIBRARY = [
    { id: 1, title: 'Perfect Push-Up Form', bodyPart: 'Chest', difficulty: 'Beginner', duration: '8 min', instructor: 'FitCare Coach', thumbnail: '💪' },
    { id: 2, title: 'Deadlift Masterclass', bodyPart: 'Back', difficulty: 'Intermediate', duration: '12 min', instructor: 'FitCare Coach', thumbnail: '🏋️' },
    { id: 3, title: 'Leg Day Foundations', bodyPart: 'Legs', difficulty: 'Beginner', duration: '15 min', instructor: 'FitCare Coach', thumbnail: '🦵' },
    { id: 4, title: 'Core Destroyer Circuit', bodyPart: 'Core', difficulty: 'Advanced', duration: '10 min', instructor: 'FitCare Coach', thumbnail: '🔥' },
    { id: 5, title: 'HIIT Cardio Blast', bodyPart: 'Cardio', difficulty: 'Intermediate', duration: '20 min', instructor: 'FitCare Coach', thumbnail: '🏃' },
    { id: 6, title: 'Bicep & Tricep Pump', bodyPart: 'Arms', difficulty: 'Beginner', duration: '10 min', instructor: 'FitCare Coach', thumbnail: '💪' },
    { id: 7, title: 'Shoulder Press Technique', bodyPart: 'Shoulders', difficulty: 'Intermediate', duration: '9 min', instructor: 'FitCare Coach', thumbnail: '🎯' },
    { id: 8, title: 'Advanced Back Training', bodyPart: 'Back', difficulty: 'Advanced', duration: '18 min', instructor: 'FitCare Coach', thumbnail: '🏋️' },
    { id: 9, title: 'Plank Variations for Core', bodyPart: 'Core', difficulty: 'Beginner', duration: '7 min', instructor: 'FitCare Coach', thumbnail: '🧘' },
    { id: 10, title: 'Sprint Interval Training', bodyPart: 'Cardio', difficulty: 'Advanced', duration: '25 min', instructor: 'FitCare Coach', thumbnail: '⚡' },
];

const DIFF_COLORS = {
    Beginner: Colors.primary,
    Intermediate: Colors.warning,
    Advanced: Colors.danger,
};

const VideoLibraryScreen = () => {
    const [bodyFilter, setBodyFilter] = useState('All');
    const [diffFilter, setDiffFilter] = useState('All');

    const filtered = VIDEO_LIBRARY.filter((v) => {
        const bodyMatch = bodyFilter === 'All' || v.bodyPart === bodyFilter;
        const diffMatch = diffFilter === 'All' || v.difficulty === diffFilter;
        return bodyMatch && diffMatch;
    });

    const FilterChip = ({ label, active, onPress }) => (
        <TouchableOpacity
            style={[styles.chip, active && styles.chipActive]}
            onPress={onPress}
        >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>🎬 Video Library</Text>
                <Text style={styles.pageCount}>{filtered.length} videos</Text>
            </View>

            {/* Body Part Filter */}
            <Text style={styles.filterLabel}>Body Part</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {BODY_PARTS.map((b) => (
                    <FilterChip key={b} label={b} active={bodyFilter === b} onPress={() => setBodyFilter(b)} />
                ))}
            </ScrollView>

            {/* Difficulty Filter */}
            <Text style={styles.filterLabel}>Difficulty</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {DIFFICULTIES.map((d) => (
                    <FilterChip key={d} label={d} active={diffFilter === d} onPress={() => setDiffFilter(d)} />
                ))}
            </ScrollView>

            {/* Video List */}
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id.toString()}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🔍</Text>
                        <Text style={styles.emptyText}>No videos match your filters.</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.videoCard} activeOpacity={0.8}>
                        <View style={styles.thumbnail}>
                            <Text style={styles.thumbnailEmoji}>{item.thumbnail}</Text>
                            <View style={styles.playBadge}>
                                <Text style={styles.playIcon}>▶</Text>
                            </View>
                        </View>
                        <View style={styles.videoInfo}>
                            <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
                            <View style={styles.videoMeta}>
                                <View style={[styles.diffBadge, { borderColor: DIFF_COLORS[item.difficulty] }]}>
                                    <Text style={[styles.diffText, { color: DIFF_COLORS[item.difficulty] }]}>
                                        {item.difficulty}
                                    </Text>
                                </View>
                                <Text style={styles.bodyPartTag}>{item.bodyPart}</Text>
                                <Text style={styles.duration}>⏱ {item.duration}</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 16 },
    pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 48, marginBottom: 16 },
    pageTitle: { color: Colors.text, fontSize: 24, fontWeight: '800' },
    pageCount: { color: Colors.textMuted, fontSize: 13 },
    filterLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
    filterScroll: { marginBottom: 10 },
    chip: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
    chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
    chipText: { color: Colors.textMuted, fontWeight: '600', fontSize: 13 },
    chipTextActive: { color: Colors.primary },
    listContent: { paddingBottom: 100, paddingTop: 8 },
    videoCard: { flexDirection: 'row', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 14, padding: 12, marginBottom: 10, gap: 12, alignItems: 'center' },
    thumbnail: { width: 70, height: 70, backgroundColor: Colors.primaryDim, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
    thumbnailEmoji: { fontSize: 28 },
    playBadge: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
    playIcon: { color: '#000', fontSize: 8, fontWeight: '900' },
    videoInfo: { flex: 1 },
    videoTitle: { color: Colors.text, fontWeight: '700', fontSize: 14, marginBottom: 8, lineHeight: 18 },
    videoMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    diffBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
    diffText: { fontSize: 11, fontWeight: '700' },
    bodyPartTag: { color: Colors.textMuted, fontSize: 11 },
    duration: { color: Colors.textMuted, fontSize: 11 },
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyText: { color: Colors.textMuted },
});

export default VideoLibraryScreen;
