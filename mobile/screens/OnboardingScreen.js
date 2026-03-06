import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, ActivityIndicator
} from 'react-native';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';

const STEPS = [
    { id: 'name', title: 'What\'s your name?', desc: 'We\'ll personalise your experience' },
    { id: 'dob', title: 'Your Age', desc: 'For age-appropriate recommendations' },
    { id: 'gender', title: 'Gender', desc: 'For accurate metabolic calculations' },
    { id: 'body', title: 'Body Measurements', desc: 'For BMI and calorie calculations' },
    { id: 'goal', title: 'Fitness Goal', desc: 'We\'ll build your plan around this' },
    { id: 'activity', title: 'Activity Level', desc: 'To customise workout intensity' },
];

const GENDER_OPTIONS = [
    { value: 'male', label: 'Male', icon: '♂' },
    { value: 'female', label: 'Female', icon: '♀' },
    { value: 'other', label: 'Other', icon: '⚧' },
];

const GOAL_OPTIONS = [
    { value: 'lose', label: 'Lose Weight', icon: '🔥' },
    { value: 'gain', label: 'Gain Muscle', icon: '💪' },
    { value: 'maintain', label: 'Maintain', icon: '⚖️' },
];

const ACTIVITY_OPTIONS = [
    { value: 'beginner', label: 'Beginner', icon: '🚶', desc: 'Light exercise 1-3 days/week' },
    { value: 'intermediate', label: 'Intermediate', icon: '🏃', desc: 'Moderate exercise 3-5 days/week' },
    { value: 'advanced', label: 'Advanced', icon: '⚡', desc: 'Hard training 6-7 days/week' },
];

const OnboardingScreen = ({ navigation, route }) => {
    const { userId, phone } = route.params;
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({
        name: '', age: '', gender: '',
        height_cm: '', weight_kg: '',
        fitness_goal: '', activity_level: '',
    });

    const current = STEPS[step];

    const updateForm = (key, value) => setForm((f) => ({ ...f, [key]: value }));

    const canProceed = () => {
        const s = current.id;
        if (s === 'name') return form.name.trim().length > 1;
        if (s === 'dob') return parseInt(form.age) >= 13 && parseInt(form.age) <= 100;
        if (s === 'gender') return form.gender !== '';
        if (s === 'body') return parseFloat(form.height_cm) > 0 && parseFloat(form.weight_kg) > 0;
        if (s === 'goal') return form.fitness_goal !== '';
        if (s === 'activity') return form.activity_level !== '';
        return false;
    };

    const handleNext = async () => {
        if (step < STEPS.length - 1) {
            setStep(step + 1);
        } else {
            await handleFinish();
        }
    };

    const handleFinish = async () => {
        setLoading(true);
        try {
            await fitcareAPI.onboardUser({
                phone,
                name: form.name,
                age: parseInt(form.age),
                gender: form.gender,
                height_cm: parseFloat(form.height_cm),
                weight_kg: parseFloat(form.weight_kg),
                fitness_goal: form.fitness_goal,
                activity_level: form.activity_level,
            });
            navigation.replace('Main', { userId });
        } catch (err) {
            Alert.alert('Error', err.message || 'Could not save profile. Try again.');
        } finally {
            setLoading(false);
        }
    };

    const renderStepContent = () => {
        switch (current.id) {
            case 'name':
                return (
                    <TextInput style={styles.input} placeholder="e.g. Aditya" placeholderTextColor={Colors.textDim}
                        value={form.name} onChangeText={(v) => updateForm('name', v)} autoCapitalize="words" />
                );

            case 'dob':
                return (
                    <TextInput style={styles.input} placeholder="Age (e.g. 22)" placeholderTextColor={Colors.textDim}
                        value={form.age} onChangeText={(v) => updateForm('age', v.replace(/\D/g, ''))}
                        keyboardType="numeric" maxLength={3} />
                );

            case 'gender':
                return (
                    <View style={styles.optionGrid}>
                        {GENDER_OPTIONS.map((o) => (
                            <TouchableOpacity
                                key={o.value} style={[styles.option, form.gender === o.value && styles.optionSelected]}
                                onPress={() => updateForm('gender', o.value)}
                            >
                                <Text style={styles.optionIcon}>{o.icon}</Text>
                                <Text style={[styles.optionLabel, form.gender === o.value && styles.optionLabelSelected]}>
                                    {o.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                );

            case 'body':
                return (
                    <>
                        <TextInput style={[styles.input, { marginBottom: 12 }]}
                            placeholder="Height (cm) e.g. 175" placeholderTextColor={Colors.textDim}
                            value={form.height_cm} onChangeText={(v) => updateForm('height_cm', v)}
                            keyboardType="decimal-pad" />
                        <TextInput style={styles.input}
                            placeholder="Weight (kg) e.g. 70" placeholderTextColor={Colors.textDim}
                            value={form.weight_kg} onChangeText={(v) => updateForm('weight_kg', v)}
                            keyboardType="decimal-pad" />
                    </>
                );

            case 'goal':
                return (
                    <View style={styles.optionGrid}>
                        {GOAL_OPTIONS.map((o) => (
                            <TouchableOpacity
                                key={o.value} style={[styles.option, form.fitness_goal === o.value && styles.optionSelected]}
                                onPress={() => updateForm('fitness_goal', o.value)}
                            >
                                <Text style={styles.optionIcon}>{o.icon}</Text>
                                <Text style={[styles.optionLabel, form.fitness_goal === o.value && styles.optionLabelSelected]}>
                                    {o.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                );

            case 'activity':
                return (
                    <View>
                        {ACTIVITY_OPTIONS.map((o) => (
                            <TouchableOpacity
                                key={o.value}
                                style={[styles.activityOption, form.activity_level === o.value && styles.optionSelected]}
                                onPress={() => updateForm('activity_level', o.value)}
                            >
                                <Text style={styles.optionIcon}>{o.icon}</Text>
                                <View>
                                    <Text style={[styles.optionLabel, form.activity_level === o.value && styles.optionLabelSelected]}>
                                        {o.label}
                                    </Text>
                                    <Text style={styles.activityDesc}>{o.desc}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                );

            default:
                return null;
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Progress dots */}
            <View style={styles.dots}>
                {STEPS.map((_, i) => (
                    <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
                ))}
            </View>

            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.desc}>{current.desc}</Text>

            {renderStepContent()}

            <View style={styles.btnRow}>
                {step > 0 && (
                    <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
                        <Text style={styles.backBtnText}>← Back</Text>
                    </TouchableOpacity>
                )}
                {loading ? (
                    <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
                ) : (
                    <TouchableOpacity
                        style={[styles.nextBtn, !canProceed() && styles.nextBtnDisabled]}
                        onPress={handleNext} disabled={!canProceed()}
                    >
                        <Text style={styles.nextBtnText}>
                            {step === STEPS.length - 1 ? 'Start My Journey →' : 'Continue →'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    content: { padding: 24, paddingTop: 60 },
    dots: { flexDirection: 'row', gap: 8, marginBottom: 32 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.textDim },
    dotActive: { backgroundColor: Colors.primary, width: 20 },
    title: { color: Colors.text, fontSize: 26, fontWeight: '800', marginBottom: 6 },
    desc: { color: Colors.textMuted, fontSize: 14, marginBottom: 28 },
    input: {
        backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border,
        borderRadius: 12, padding: 16, color: Colors.text, fontSize: 16,
    },
    optionGrid: { gap: 12 },
    option: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
        backgroundColor: Colors.card,
    },
    optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryDim },
    optionIcon: { fontSize: 24 },
    optionLabel: { color: Colors.textMuted, fontWeight: '600', fontSize: 16 },
    optionLabelSelected: { color: Colors.primary },
    activityOption: {
        flexDirection: 'row', alignItems: 'center', gap: 16,
        padding: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
        backgroundColor: Colors.card, marginBottom: 10,
    },
    activityDesc: { color: Colors.textDim, fontSize: 12, marginTop: 2 },
    btnRow: { flexDirection: 'row', gap: 12, marginTop: 40 },
    backBtn: {
        padding: 16, borderRadius: 12, borderWidth: 1,
        borderColor: Colors.border, alignItems: 'center', minWidth: 80,
    },
    backBtnText: { color: Colors.textMuted, fontWeight: '600' },
    nextBtn: {
        flex: 1, backgroundColor: Colors.primary,
        padding: 16, borderRadius: 12, alignItems: 'center',
    },
    nextBtnDisabled: { backgroundColor: Colors.textDim },
    nextBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
});

export default OnboardingScreen;
