import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';

const LoginScreen = ({ navigation }) => {
    const [step, setStep] = useState('phone'); // 'phone' | 'otp'
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRequestOTP = async () => {
        if (phone.length !== 10 || !/^\d+$/.test(phone)) {
            Alert.alert('Invalid Number', 'Enter a valid 10-digit Indian mobile number.');
            return;
        }
        setLoading(true);
        try {
            await fitcareAPI.requestOTP(phone);
            setStep('otp');
        } catch (err) {
            Alert.alert('Error', err.message || 'Could not send OTP. Is the backend running?');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async () => {
        if (otp.length !== 4) {
            Alert.alert('Invalid OTP', 'Enter the 4-digit code.');
            return;
        }
        setLoading(true);
        try {
            const res = await fitcareAPI.verifyOTP(phone, otp);
            if (res.is_new_user) {
                navigation.replace('Onboarding', { userId: res.user_id, phone });
            } else {
                navigation.replace('Main', { userId: res.user_id });
            }
        } catch (err) {
            Alert.alert('Verification Failed', 'Invalid or expired OTP. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.header}>
                <Text style={styles.logo}>⚡</Text>
                <Text style={styles.title}>FITCARE</Text>
                <Text style={styles.tagline}>Your Personal Health & Fitness Journey</Text>
            </View>

            <View style={styles.card}>
                {step === 'phone' ? (
                    <>
                        <Text style={styles.stepTitle}>Enter Mobile Number</Text>
                        <Text style={styles.stepDesc}>We'll send a 4-digit OTP to verify your identity</Text>
                        <View style={styles.inputRow}>
                            <Text style={styles.countryCode}>+91</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="9876543210"
                                placeholderTextColor={Colors.textDim}
                                keyboardType="phone-pad"
                                maxLength={10}
                                value={phone}
                                onChangeText={setPhone}
                            />
                        </View>
                        {loading ? (
                            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
                        ) : (
                            <TouchableOpacity style={styles.btn} onPress={handleRequestOTP}>
                                <Text style={styles.btnText}>Send OTP →</Text>
                            </TouchableOpacity>
                        )}
                    </>
                ) : (
                    <>
                        <Text style={styles.stepTitle}>Enter OTP</Text>
                        <Text style={styles.stepDesc}>
                            Sent to +91 {phone}{'  '}
                            <Text style={styles.link} onPress={() => setStep('phone')}>Change</Text>
                        </Text>
                        <TextInput
                            style={[styles.input, styles.otpInput]}
                            placeholder="• • • •"
                            placeholderTextColor={Colors.textDim}
                            keyboardType="number-pad"
                            maxLength={4}
                            value={otp}
                            onChangeText={setOtp}
                        />
                        {loading ? (
                            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
                        ) : (
                            <TouchableOpacity style={styles.btn} onPress={handleVerifyOTP}>
                                <Text style={styles.btnText}>Verify & Continue →</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={{ marginTop: 16 }}
                            onPress={() => { setStep('phone'); setOtp(''); }}
                        >
                            <Text style={styles.link}>Resend OTP</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1, backgroundColor: Colors.background,
        justifyContent: 'center', padding: 24,
    },
    header: { alignItems: 'center', marginBottom: 32 },
    logo: { fontSize: 48, marginBottom: 8 },
    title: {
        fontSize: 36, fontWeight: '900', color: Colors.primary,
        letterSpacing: 6,
        textShadowColor: Colors.primaryGlow,
        textShadowRadius: 12,
    },
    tagline: { color: Colors.textMuted, marginTop: 6, fontSize: 13 },

    card: {
        backgroundColor: Colors.card,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 20, padding: 24,
    },
    stepTitle: { color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: 6 },
    stepDesc: { color: Colors.textMuted, fontSize: 13, marginBottom: 20 },

    inputRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: Colors.inputBg,
        borderWidth: 1, borderColor: Colors.border,
        borderRadius: 12, overflow: 'hidden', marginBottom: 20,
    },
    countryCode: {
        color: Colors.primary, paddingHorizontal: 14,
        fontWeight: '700', fontSize: 16,
        borderRightWidth: 1, borderRightColor: Colors.border, paddingVertical: 15,
    },
    input: {
        flex: 1, color: Colors.text, fontSize: 18, padding: 15,
    },
    otpInput: {
        backgroundColor: Colors.inputBg,
        borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
        textAlign: 'center', fontSize: 28, letterSpacing: 16,
        color: Colors.primary, marginBottom: 20, padding: 15,
    },
    btn: {
        backgroundColor: Colors.primary, borderRadius: 12,
        padding: 16, alignItems: 'center',
    },
    btnText: { color: '#000', fontWeight: '800', fontSize: 16 },
    link: { color: Colors.primary, fontWeight: '600', textAlign: 'center' },
    devBadge: {
        backgroundColor: 'rgba(255,153,0,0.15)', borderWidth: 1,
        borderColor: Colors.warning, borderRadius: 8,
        padding: 10, marginBottom: 16,
    },
    devBadgeText: { color: Colors.warning, fontSize: 12, textAlign: 'center' },
});

export default LoginScreen;
