import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, Alert, ActivityIndicator,
    KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import Animated, {
    useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
    interpolate, Extrapolation,
} from 'react-native-reanimated';
import { MotiView, MotiText, AnimatePresence } from 'moti';
import { Colors } from '../constants/Colors';
import { fitcareAPI } from '../services/api';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const SCROLL_THRESHOLD = 150;
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const NEON = '#39FF14';

// ─── StaggeredText: character-level spring wave ───────────────────────────────
const StaggeredText = ({ text, style, baseDelay = 0, charDelay = 55 }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {text.split('').map((char, i) => (
            <MotiView
                key={`${char}-${i}`}
                from={{ opacity: 0, translateY: 24, scale: 0.5 }}
                animate={{ opacity: 1, translateY: 0, scale: 1 }}
                transition={{
                    type: 'spring',
                    damping: 13,
                    stiffness: 130,
                    delay: baseDelay + i * charDelay,
                }}
            >
                <Text style={style}>{char === ' ' ? '\u00A0' : char}</Text>
            </MotiView>
        ))}
    </View>
);

// ─── WordStagger: word-level fade+scale ──────────────────────────────────────
const WordStagger = ({ text, style, baseDelay = 0 }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
        {text.split('_').map((word, i) => (
            <MotiView
                key={`${word}-${i}`}
                from={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                    type: 'spring',
                    damping: 14,
                    stiffness: 120,
                    delay: baseDelay + i * 120,
                }}
            >
                <Text style={style}>{word}</Text>
            </MotiView>
        ))}
    </View>
);


// ─── WelcomeSequence ──────────────────────────────────────────────────────────
const WelcomeSequence = ({ onDone }) => {
    useEffect(() => {
        const t = setTimeout(onDone, 2600);
        return () => clearTimeout(t);
    }, [onDone]);

    return (
        <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'timing', duration: 300 }}
            style={styles.welcomeOverlay}
        >
            {/* FITCARE — char stagger */}
            <StaggeredText
                text="FITCARE"
                style={styles.welcomeTitle}
                baseDelay={100}
                charDelay={70}
            />

            {/* Pulsing glow ring under title */}
            <MotiView
                from={{ opacity: 0.3, scale: 0.9 }}
                animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.95, 1.05, 0.95] }}
                transition={{ type: 'timing', duration: 1200, loop: true }}
                style={styles.glowRing}
            />

            {/* WELCOME_ATHLETE — word stagger */}
            <View style={{ marginTop: 28 }}>
                <WordStagger
                    text="WELCOME_ATHLETE"
                    style={styles.welcomeSub}
                    baseDelay={650}
                />
            </View>

            {/* Bottom status line */}
            <MotiText
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'timing', duration: 400, delay: 1400 }}
                style={styles.welcomeStatus}
            >
                {'>> INITIALISING CYBERNETIC CORE...'}
            </MotiText>
        </MotiView>
    );
};


// ─── Corner Brackets ─────────────────────────────────────────────────────────
const CornerBrackets = () => (
    <>
        <View style={styles.cornerTL} />
        <View style={styles.cornerTR} />
        <View style={styles.cornerBL} />
        <View style={styles.cornerBR} />
    </>
);

// ─── Neon Button ─────────────────────────────────────────────────────────────
const NeonButton = ({ label, onPress }) => (
    <TouchableOpacity style={styles.neonBtn} onPress={onPress} activeOpacity={0.75}>
        <Text style={styles.neonBtnText}>{label}</Text>
    </TouchableOpacity>
);

// ─── Main LoginScreen ─────────────────────────────────────────────────────────
const LoginScreen = ({ navigation }) => {
    const [step, setStep] = useState('phone');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);
    const pendingNav = useRef(null);

    const scrollY = useSharedValue(0);

    const scrollHandler = useAnimatedScrollHandler((e) => {
        scrollY.value = e.contentOffset.y;
    });

    const animatedCardStyle = useAnimatedStyle(() => ({
        borderRadius: interpolate(scrollY.value, [0, SCROLL_THRESHOLD], [0, 40], Extrapolation.CLAMP),
        shadowOpacity: interpolate(scrollY.value, [0, SCROLL_THRESHOLD], [0.25, 0.9], Extrapolation.CLAMP),
        shadowRadius: interpolate(scrollY.value, [0, SCROLL_THRESHOLD], [8, 32], Extrapolation.CLAMP),
        borderColor: `rgba(0,255,0,${interpolate(scrollY.value, [0, SCROLL_THRESHOLD], [0.2, 1.0], Extrapolation.CLAMP)})`,
    }));

    const animatedLogoStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(scrollY.value, [0, SCROLL_THRESHOLD], [1, 0.78], Extrapolation.CLAMP) }],
        opacity: interpolate(scrollY.value, [0, SCROLL_THRESHOLD], [1, 0.6], Extrapolation.CLAMP),
    }));

    const handleRequestOTP = useCallback(async () => {
        if (phone.length !== 10 || !/^\d+$/.test(phone)) {
            Alert.alert('Invalid Number', 'Enter a valid 10-digit Indian mobile number.');
            return;
        }
        setLoading(true);
        try {
            await fitcareAPI.requestOTP(phone);
            setStep('otp');
        } catch (err) {
            Alert.alert('Error', err.message || 'Could not connect to backend.');
        } finally {
            setLoading(false);
        }
    }, [phone]);

    const handleVerifyOTP = useCallback(async () => {
        if (otp.length !== 4) {
            Alert.alert('Invalid OTP', 'Enter the 4-digit code.');
            return;
        }
        setLoading(true);
        try {
            const res = await fitcareAPI.verifyOTP(phone, otp);
            // Store navigation target, then trigger welcome sequence
            pendingNav.current = res.is_new_user
                ? () => navigation.replace('Onboarding', { userId: res.user_id, phone })
                : () => navigation.replace('Main', { userId: res.user_id });
            setShowWelcome(true);
        } catch (err) {
            Alert.alert('Verification Failed', 'Invalid or expired OTP. Try again.');
        } finally {
            setLoading(false);
        }
    }, [phone, otp, navigation]);

    const handleWelcomeDone = useCallback(() => {
        pendingNav.current?.();
    }, []);

    return (
        <View style={styles.root}>
            {/* ── Welcome Sequence (full-screen overlay, layout-isolated) ── */}
            <AnimatePresence>
                {showWelcome && (
                    <WelcomeSequence key="welcome" onDone={handleWelcomeDone} />
                )}
            </AnimatePresence>

            {/* ── Login UI (hidden behind welcome when showWelcome=true) ── */}
            <KeyboardAvoidingView
                style={StyleSheet.absoluteFill}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                pointerEvents={showWelcome ? 'none' : 'auto'}
            >

                <Animated.ScrollView
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    bounces
                >
                    {/* Header */}
                    <View style={styles.headerContainer}>
                        <Animated.View style={[styles.logoWrap, animatedLogoStyle]}>
                            <MotiView
                                from={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', damping: 12, stiffness: 120, delay: 100 }}
                                style={styles.logoGlowRing}
                            >
                                <Text style={styles.logoEmoji}>⚡</Text>
                            </MotiView>
                        </Animated.View>

                        <MotiText
                            from={{ translateY: -40, opacity: 0 }}
                            animate={{ translateY: 0, opacity: 1 }}
                            transition={{ type: 'spring', damping: 14, stiffness: 140, delay: 250 }}
                            style={styles.title}
                        >
                            FITCARE
                        </MotiText>

                        <MotiText
                            from={{ opacity: 0, translateY: -12 }}
                            animate={{ opacity: 1, translateY: 0 }}
                            transition={{ type: 'timing', duration: 600, delay: 450 }}
                            style={styles.tagline}
                        >
                            {'// CYBERNETIC WELLNESS INTERFACE'}
                        </MotiText>

                        <MotiView
                            from={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ type: 'timing', duration: 800, delay: 900 }}
                            style={styles.scrollHint}
                        >
                            <Text style={styles.scrollHintText}>↓ scroll to initialise</Text>
                        </MotiView>
                    </View>

                    {/* Login Card */}
                    <Animated.View style={[styles.card, animatedCardStyle]}>
                        <CornerBrackets />
                        {step === 'phone' ? (
                            <PhoneStep phone={phone} setPhone={setPhone} loading={loading} onSubmit={handleRequestOTP} />
                        ) : (
                            <OtpStep phone={phone} otp={otp} setOtp={setOtp} loading={loading} onSubmit={handleVerifyOTP} onBack={() => { setStep('phone'); setOtp(''); }} />
                        )}
                    </Animated.View>

                    <View style={{ height: 80 }} />
                </Animated.ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
};

// ─── Phone Step ───────────────────────────────────────────────────────────────
const PhoneStep = ({ phone, setPhone, loading, onSubmit }) => (
    <>
        <MotiView from={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 16, stiffness: 160, delay: 150 }}>
            <Text style={styles.stepLabel}>{'> PHASE_01'}</Text>
            <Text style={styles.stepTitle}>IDENTIFY AGENT</Text>
            <Text style={styles.stepDesc}>Transmit your 10-digit mobile handshake.</Text>
        </MotiView>
        <MotiView from={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 18, stiffness: 150, delay: 280 }} style={styles.inputRow}>
            <Text style={styles.countryCode}>+91</Text>
            <TextInput style={styles.input} placeholder="9876543210" placeholderTextColor={Colors.textDim} keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={setPhone} selectionColor={Colors.primary} />
        </MotiView>
        <MotiView from={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 18, stiffness: 150, delay: 380 }}>
            {loading ? <View style={styles.loaderWrap}><ActivityIndicator color={Colors.primary} /><Text style={styles.loaderText}>TRANSMITTING...</Text></View>
                : <NeonButton label="SEND OTP →" onPress={onSubmit} />}
        </MotiView>
    </>
);

// ─── OTP Step ─────────────────────────────────────────────────────────────────
const OtpStep = ({ phone, otp, setOtp, loading, onSubmit, onBack }) => (
    <>
        <MotiView from={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 16, stiffness: 160, delay: 80 }}>
            <Text style={styles.stepLabel}>{'> PHASE_02'}</Text>
            <Text style={styles.stepTitle}>AUTHENTICATE</Text>
            <Text style={styles.stepDesc}>4-digit cipher dispatched to +91 {phone}{'  '}<Text style={styles.link} onPress={onBack}>[ CHANGE ]</Text></Text>
        </MotiView>
        <MotiView from={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 18, stiffness: 150, delay: 200 }}>
            <TextInput style={styles.otpInput} placeholder="• • • •" placeholderTextColor={Colors.textDim} keyboardType="number-pad" maxLength={4} value={otp} onChangeText={setOtp} selectionColor={Colors.primary} />
        </MotiView>
        <MotiView from={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', damping: 18, stiffness: 150, delay: 320 }}>
            {loading ? <View style={styles.loaderWrap}><ActivityIndicator color={Colors.primary} /><Text style={styles.loaderText}>VERIFYING CIPHER...</Text></View>
                : <NeonButton label="VERIFY & ENTER →" onPress={onSubmit} />}
        </MotiView>
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 500, delay: 500 }} style={{ alignItems: 'center', marginTop: 18 }}>
            <TouchableOpacity onPress={onBack}><Text style={styles.link}>[ RESEND OTP ]</Text></TouchableOpacity>
        </MotiView>
    </>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000000' },

    // Welcome overlay
    welcomeOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 100,
        backgroundColor: 'rgba(0,0,0,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    welcomeTitle: {
        fontSize: 54,
        fontWeight: '900',
        color: NEON,
        letterSpacing: 10,
        textShadowColor: NEON,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 24,
    },
    welcomeSub: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.primary,
        letterSpacing: 4,
        fontFamily: MONO,
        textShadowColor: Colors.primary,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    welcomeStatus: {
        position: 'absolute',
        bottom: 60,
        color: Colors.textDim,
        fontSize: 11,
        letterSpacing: 2,
        fontFamily: MONO,
    },
    glowRing: {
        position: 'absolute',
        width: SCREEN_WIDTH * 0.8,
        height: 2,
        backgroundColor: NEON,
        shadowColor: NEON,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 18,
        marginTop: 12,
    },

    // Scroll
    scrollContent: { paddingHorizontal: 20, paddingTop: 80 },

    // Header
    headerContainer: { alignItems: 'center', marginBottom: 36 },
    logoWrap: { marginBottom: 14 },
    logoGlowRing: {
        width: 80, height: 80, borderRadius: 40,
        borderWidth: 1.5, borderColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center',
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8, shadowRadius: 20, elevation: 12,
        backgroundColor: 'rgba(0,255,0,0.05)',
    },
    logoEmoji: { fontSize: 36 },
    title: {
        fontSize: 38, fontWeight: '900', color: Colors.primary, letterSpacing: 8,
        textShadowColor: Colors.primaryGlow, textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 18, marginBottom: 6,
    },
    tagline: { color: Colors.textDim, fontSize: 11, letterSpacing: 2, fontFamily: MONO },
    scrollHint: { marginTop: 18 },
    scrollHintText: { color: 'rgba(0,255,0,0.35)', fontSize: 11, letterSpacing: 3, fontFamily: MONO },

    // Card
    card: {
        backgroundColor: 'rgba(10,10,10,0.98)', borderWidth: 1, borderColor: Colors.border,
        borderRadius: 0, padding: 28,
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25, shadowRadius: 8, elevation: 14, overflow: 'visible',
    },

    // Corners
    cornerTL: { position: 'absolute', top: -1, left: -1, width: 18, height: 18, borderTopWidth: 2, borderLeftWidth: 2, borderColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6 },
    cornerTR: { position: 'absolute', top: -1, right: -1, width: 18, height: 18, borderTopWidth: 2, borderRightWidth: 2, borderColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6 },
    cornerBL: { position: 'absolute', bottom: -1, left: -1, width: 18, height: 18, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6 },
    cornerBR: { position: 'absolute', bottom: -1, right: -1, width: 18, height: 18, borderBottomWidth: 2, borderRightWidth: 2, borderColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 6 },

    // Step
    stepLabel: { color: Colors.textDim, fontSize: 11, letterSpacing: 3, fontFamily: MONO, marginBottom: 4 },
    stepTitle: { color: Colors.text, fontSize: 22, fontWeight: '900', letterSpacing: 4, marginBottom: 6 },
    stepDesc: { color: Colors.textMuted, fontSize: 12, letterSpacing: 1, marginBottom: 22, lineHeight: 18, fontFamily: MONO },

    // Inputs
    inputRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.inputBg,
        borderWidth: 1, borderColor: Colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: 22,
    },
    countryCode: { color: Colors.primary, paddingHorizontal: 14, fontWeight: '900', fontSize: 16, borderRightWidth: 1, borderRightColor: Colors.border, paddingVertical: 16, fontFamily: MONO },
    input: { flex: 1, color: Colors.text, fontSize: 20, paddingHorizontal: 14, paddingVertical: 14, fontFamily: MONO, letterSpacing: 2 },
    otpInput: {
        backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.border, borderRadius: 4,
        textAlign: 'center', fontSize: 32, letterSpacing: 18, color: Colors.primary,
        marginBottom: 22, paddingVertical: 16,
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10,
    },

    // Button
    neonBtn: {
        backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 4,
        paddingVertical: 16, alignItems: 'center',
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 12, elevation: 10,
    },
    neonBtnText: { color: Colors.primary, fontWeight: '900', fontSize: 14, letterSpacing: 4, fontFamily: MONO },
    link: { color: Colors.primary, fontWeight: '700', fontFamily: MONO, letterSpacing: 1, fontSize: 12 },

    // Loader
    loaderWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
    loaderText: { color: Colors.primary, fontSize: 12, letterSpacing: 3, fontFamily: MONO },
});

export default LoginScreen;
