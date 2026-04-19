import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    Dimensions,
    TouchableOpacity,
    ActivityIndicator,
    Animated,
    ScrollView,
    Platform,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import Svg, { Line, Circle } from 'react-native-svg';
import { fitcareAPI } from '../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ================================================================
//  DESIGN SYSTEM — Dark Academia / Underground Terminal
// ================================================================

const COLORS = {
    bg: '#0A0A0A',
    bgDeep: '#050505',
    surface: 'rgba(10, 10, 10, 0.85)',
    surfaceGlass: 'rgba(15, 15, 15, 0.75)',
    primary: '#39FF14',           // Neon Green — correct
    primaryDim: 'rgba(57, 255, 20, 0.15)',
    primaryGlow: 'rgba(57, 255, 20, 0.4)',
    danger: '#FF3131',            // Neon Red — errors
    dangerDim: 'rgba(255, 49, 49, 0.15)',
    dangerGlow: 'rgba(255, 49, 49, 0.5)',
    warning: '#FFB800',
    warningDim: 'rgba(255, 184, 0, 0.15)',
    white: '#FFFFFF',
    textMuted: '#6d6d80',
    textDim: '#3a3a4a',
    border: 'rgba(57, 255, 20, 0.2)',
    borderDanger: 'rgba(255, 49, 49, 0.3)',
};

const FONTS = {
    mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};
const SEQUENCE_LENGTH = 30;        
const NUM_LANDMARKS = 33;           
const COORDS_PER_LANDMARK = 3;      
const FEATURES_PER_FRAME = NUM_LANDMARKS * COORDS_PER_LANDMARK; 
const FRAME_SKIP = 5;               


const SKELETON_CONNECTIONS = [
    [11, 13], [13, 15],   
    [12, 14], [14, 16],   
    [11, 12],            
    [11, 23], [12, 24],   
    [23, 24],            
    [23, 25], [25, 27],   
    [24, 26], [26, 28],   
    [0, 1], [1, 2], [2, 3], [3, 7],  
    [0, 4], [4, 5], [5, 6], [6, 8],  
    [15, 17], [15, 19], [15, 21],    
    [16, 18], [16, 20], [16, 22],    
    [27, 29], [29, 31],              
    [28, 30], [30, 32],              
];


const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const NOSE = 0;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;



 *
 * @param {Array} landmarks - Array of 33 objects with {x, y, z}
 * @returns {Array} Flat array of 99 normalized floats
 */
function normalizeLandmarks(landmarks) {
    if (!landmarks || landmarks.length < NUM_LANDMARKS) {
        return new Array(FEATURES_PER_FRAME).fill(0);
    }

    // 1. Compute hip midpoint (center of mass proxy)
    const hipCenterX = (landmarks[LEFT_HIP].x + landmarks[RIGHT_HIP].x) / 2;
    const hipCenterY = (landmarks[LEFT_HIP].y + landmarks[RIGHT_HIP].y) / 2;
    const hipCenterZ = (landmarks[LEFT_HIP].z + landmarks[RIGHT_HIP].z) / 2;

    // 2. Compute body height for scale (nose to ankle midpoint)
    const ankleMidX = (landmarks[LEFT_ANKLE].x + landmarks[RIGHT_ANKLE].x) / 2;
    const ankleMidY = (landmarks[LEFT_ANKLE].y + landmarks[RIGHT_ANKLE].y) / 2;
    const noseX = landmarks[NOSE].x;
    const noseY = landmarks[NOSE].y;

    const bodyHeight = Math.sqrt(
        Math.pow(noseX - ankleMidX, 2) + Math.pow(noseY - ankleMidY, 2)
    );
    const scale = bodyHeight > 0.01 ? bodyHeight : 1.0; // Avoid division by zero

    // 3. Center and scale each landmark
    const normalized = [];
    for (let i = 0; i < NUM_LANDMARKS; i++) {
        const lm = landmarks[i];
        normalized.push((lm.x - hipCenterX) / scale);
        normalized.push((lm.y - hipCenterY) / scale);
        normalized.push(((lm.z || 0) - hipCenterZ) / scale);
    }

    return normalized;
}


// ================================================================
//  SIMULATED POSE DATA (Dev Mode — until real pose detector plugged in)
// ================================================================

/**
 * Generate simulated landmark data for development/demo purposes.
 * Produces a plausible standing human pose with slight random variation.
 */
function generateSimulatedLandmarks() {
    // Base standing pose (normalized coordinates 0-1 range)
    const basePose = [
        { x: 0.50, y: 0.15, z: 0 },   // 0  nose
        { x: 0.49, y: 0.13, z: 0 },   // 1  left eye inner
        { x: 0.48, y: 0.13, z: 0 },   // 2  left eye
        { x: 0.47, y: 0.13, z: 0 },   // 3  left eye outer
        { x: 0.51, y: 0.13, z: 0 },   // 4  right eye inner
        { x: 0.52, y: 0.13, z: 0 },   // 5  right eye
        { x: 0.53, y: 0.13, z: 0 },   // 6  right eye outer
        { x: 0.46, y: 0.14, z: 0 },   // 7  left ear
        { x: 0.54, y: 0.14, z: 0 },   // 8  right ear
        { x: 0.49, y: 0.18, z: 0 },   // 9  mouth left
        { x: 0.51, y: 0.18, z: 0 },   // 10 mouth right
        { x: 0.40, y: 0.30, z: 0 },   // 11 left shoulder
        { x: 0.60, y: 0.30, z: 0 },   // 12 right shoulder
        { x: 0.35, y: 0.45, z: 0 },   // 13 left elbow
        { x: 0.65, y: 0.45, z: 0 },   // 14 right elbow
        { x: 0.33, y: 0.58, z: 0 },   // 15 left wrist
        { x: 0.67, y: 0.58, z: 0 },   // 16 right wrist
        { x: 0.32, y: 0.60, z: 0 },   // 17 left pinky
        { x: 0.68, y: 0.60, z: 0 },   // 18 right pinky
        { x: 0.31, y: 0.59, z: 0 },   // 19 left index
        { x: 0.69, y: 0.59, z: 0 },   // 20 right index
        { x: 0.33, y: 0.57, z: 0 },   // 21 left thumb
        { x: 0.67, y: 0.57, z: 0 },   // 22 right thumb
        { x: 0.44, y: 0.55, z: 0 },   // 23 left hip
        { x: 0.56, y: 0.55, z: 0 },   // 24 right hip
        { x: 0.43, y: 0.72, z: 0 },   // 25 left knee
        { x: 0.57, y: 0.72, z: 0 },   // 26 right knee
        { x: 0.42, y: 0.90, z: 0 },   // 27 left ankle
        { x: 0.58, y: 0.90, z: 0 },   // 28 right ankle
        { x: 0.41, y: 0.93, z: 0 },   // 29 left heel
        { x: 0.59, y: 0.93, z: 0 },   // 30 right heel
        { x: 0.40, y: 0.95, z: 0 },   // 31 left foot index
        { x: 0.60, y: 0.95, z: 0 },   // 32 right foot index
    ];

    // Add slight random variation to simulate movement
    return basePose.map(lm => ({
        x: lm.x + (Math.random() - 0.5) * 0.02,
        y: lm.y + (Math.random() - 0.5) * 0.02,
        z: lm.z + (Math.random() - 0.5) * 0.01,
    }));
}


// ================================================================
//  MAIN COMPONENT
// ================================================================

export default function FormCorrectionScreen({ route, navigation }) {
    const { userId, exerciseType = 'pushup' } = route.params || { userId: 1 };

    // ---- State ----
    const [hasPermission, setHasPermission] = useState(null);
    const [tfReady, setTfReady] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [accuracy, setAccuracy] = useState(0);
    const [jointStatus, setJointStatus] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [statusMessage, setStatusMessage] = useState('INITIALIZING_SUBSYSTEMS...');
    const [frameCount, setFrameCount] = useState(0);
    const [hasError, setHasError] = useState(false);

    // ---- Refs ----
    const cameraRef = useRef(null);
    const slidingWindowRef = useRef([]);       // Circular buffer: Array of 99-float arrays
    const frameCounterRef = useRef(0);         // Total frames seen (for skip logic)
    const analyzeIntervalRef = useRef(null);
    const isAnalyzingRef = useRef(false);       // Prevent overlapping requests
    const lastSpokenRef = useRef(0);

    // ---- Animations ----
    const alertPulse = useRef(new Animated.Value(0)).current;
    const accuracyAnim = useRef(new Animated.Value(0)).current;
    const scanLineAnim = useRef(new Animated.Value(0)).current;

    // ================================================================
    //  INITIALIZATION
    // ================================================================

    useEffect(() => {
        let mounted = true;

        async function init() {
            // 1. Request camera permission
            const { status } = await Camera.requestCameraPermissionsAsync();
            if (mounted) setHasPermission(status === 'granted');

            // 2. Initialize TensorFlow.js (backend-side model, so we just mark ready)
            // In a full implementation, you'd do: await tf.ready(); here
            // For now the inference happens on the backend via REST
            if (mounted) {
                setTfReady(true);
                setStatusMessage('SUBSYSTEMS_ONLINE. Ready to analyze.');
            }
        }

        init();

        // Start scan line animation
        Animated.loop(
            Animated.timing(scanLineAnim, {
                toValue: 1,
                duration: 3000,
                useNativeDriver: true,
            })
        ).start();

        return () => {
            mounted = false;
            stopAnalysis();
        };
    }, []);

    // ================================================================
    //  ALERT PULSE ANIMATION
    // ================================================================

    useEffect(() => {
        if (hasError) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(alertPulse, {
                        toValue: 1,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                    Animated.timing(alertPulse, {
                        toValue: 0.3,
                        duration: 600,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            alertPulse.stopAnimation();
            alertPulse.setValue(0);
        }
    }, [hasError]);

    // ================================================================
    //  SLIDING WINDOW & ANALYSIS
    // ================================================================

    const pushToSlidingWindow = useCallback((normalizedFrame) => {
        const window = slidingWindowRef.current;
        window.push(normalizedFrame);

        // Maintain exactly SEQUENCE_LENGTH frames
        while (window.length > SEQUENCE_LENGTH) {
            window.shift();
        }
    }, []);

    const runAnalysis = useCallback(async () => {
        if (isAnalyzingRef.current) return; // Prevent overlapping
        if (slidingWindowRef.current.length < SEQUENCE_LENGTH) return; // Not enough data

        isAnalyzingRef.current = true;

        try {
            // Deep copy the current window
            const sequenceCopy = slidingWindowRef.current.map(frame => [...frame]);

            const result = await fitcareAPI.analyzeFormSequence(exerciseType, sequenceCopy);

            // Update state with results
            setAccuracy(result.accuracy || 0);
            setJointStatus(result.joint_status || []);
            setAlerts(result.alerts || []);

            // Animate accuracy change
            Animated.timing(accuracyAnim, {
                toValue: result.accuracy || 0,
                duration: 400,
                useNativeDriver: false,
            }).start();

            // Check for errors
            const hasFormErrors = (result.alerts || []).length > 0;
            setHasError(hasFormErrors);

            // Build status message
            if (hasFormErrors) {
                const topAlert = result.alerts[0];
                setStatusMessage(topAlert.message || 'FORM_DEVIATION_DETECTED');

                // Audio feedback (throttled)
                const now = Date.now();
                if (now - lastSpokenRef.current > 4000) {
                    Speech.speak(topAlert.message.replace(/::/g, '').replace(/—/g, ','), {
                        rate: 0.85,
                        pitch: 0.8,
                    });
                    lastSpokenRef.current = now;
                }
            } else {
                setStatusMessage('FORM_ANALYSIS :: ALL_NOMINAL');
            }
        } catch (err) {
            console.error('[FormAnalysis] Error:', err.message);
            setStatusMessage('BACKEND_ERROR :: Check connection');
        } finally {
            isAnalyzingRef.current = false;
        }
    }, [exerciseType]);

    // ================================================================
    //  START / STOP CONTROLS
    // ================================================================

    const startAnalysis = useCallback(() => {
        setIsAnalyzing(true);
        setStatusMessage('ANALYSIS_LIVE — Collecting frames...');
        slidingWindowRef.current = [];
        frameCounterRef.current = 0;

        // Simulate pose detection loop (generates landmarks every 200ms)
        // In production, replace with real on-device pose detector
        analyzeIntervalRef.current = setInterval(() => {
            frameCounterRef.current += 1;
            setFrameCount(frameCounterRef.current);

            // Rate limiting: only process every FRAME_SKIP-th frame
            if (frameCounterRef.current % FRAME_SKIP !== 0) return;

            // Generate simulated landmarks (replace with real pose detector)
            const landmarks = generateSimulatedLandmarks();
            const normalized = normalizeLandmarks(landmarks);
            pushToSlidingWindow(normalized);

            // Once buffer is full, run backend analysis
            if (slidingWindowRef.current.length >= SEQUENCE_LENGTH) {
                runAnalysis();
            }
        }, 200); // ~5 FPS capture rate
    }, [pushToSlidingWindow, runAnalysis]);

    const stopAnalysis = useCallback(() => {
        if (analyzeIntervalRef.current) {
            clearInterval(analyzeIntervalRef.current);
            analyzeIntervalRef.current = null;
        }
        setIsAnalyzing(false);
        setStatusMessage('ANALYSIS_TERMINATED');
        setHasError(false);
    }, []);

    // ================================================================
    //  RENDER HELPERS
    // ================================================================

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'ok': return COLORS.primary;
            case 'warning': return COLORS.warning;
            case 'critical': return COLORS.danger;
            default: return COLORS.textMuted;
        }
    };

    const getAccuracyColor = () => {
        if (accuracy >= 70) return COLORS.primary;
        if (accuracy >= 50) return COLORS.warning;
        return COLORS.danger;
    };

    // Scan line translateY interpolation
    const scanLineTranslateY = scanLineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, SCREEN_HEIGHT],
    });

    // Alert box animated border color
    const alertBorderColor = alertPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [COLORS.borderDanger, COLORS.danger],
    });

    const alertBgColor = alertPulse.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255, 49, 49, 0.05)', 'rgba(255, 49, 49, 0.2)'],
    });

    // ================================================================
    //  RENDER — Loading / Permission States
    // ================================================================

    if (hasPermission === null) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>REQUESTING_BIOMETRIC_ACCESS...</Text>
            </View>
        );
    }

    if (hasPermission === false) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>BIOMETRIC_ERROR :: Camera access denied.</Text>
                <Text style={styles.errorSub}>Grant camera permission in system settings.</Text>
            </View>
        );
    }

    // ================================================================
    //  RENDER — Main UI
    // ================================================================

    return (
        <View style={styles.container}>
            {/* ===== CAMERA LAYER ===== */}
            <View style={styles.cameraFrame}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing="front"
                    onCameraReady={() => console.log('[Camera] Ready')}
                />

                {/* Scan Line Animation */}
                {isAnalyzing && (
                    <Animated.View
                        style={[
                            styles.scanLine,
                            { transform: [{ translateY: scanLineTranslateY }] },
                        ]}
                    />
                )}

                {/* SVG Skeleton Overlay (placeholder visual) */}
                <Svg style={styles.skeletonOverlay} viewBox={`0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}`}>
                    {isAnalyzing && SKELETON_CONNECTIONS.map(([from, to], idx) => {
                        // Map landmark indices to approximate screen positions
                        const simLandmarks = generateSimulatedLandmarks();
                        const x1 = simLandmarks[from].x * SCREEN_WIDTH;
                        const y1 = simLandmarks[from].y * SCREEN_HEIGHT;
                        const x2 = simLandmarks[to].x * SCREEN_WIDTH;
                        const y2 = simLandmarks[to].y * SCREEN_HEIGHT;
                        return (
                            <Line
                                key={idx}
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke={hasError ? COLORS.danger : COLORS.primary}
                                strokeWidth="2"
                                opacity={0.6}
                            />
                        );
                    })}
                    {isAnalyzing && Array.from({ length: NUM_LANDMARKS }).map((_, idx) => {
                        const simLandmarks = generateSimulatedLandmarks();
                        return (
                            <Circle
                                key={`dot-${idx}`}
                                cx={simLandmarks[idx].x * SCREEN_WIDTH}
                                cy={simLandmarks[idx].y * SCREEN_HEIGHT}
                                r="4"
                                fill={hasError ? COLORS.danger : COLORS.primary}
                                opacity={0.8}
                            />
                        );
                    })}
                </Svg>

                {/* ===== TOP HUD BAR ===== */}
                <View style={styles.hudTop}>
                    <Text style={styles.hudTitle}>[ FORM_TRACKER_V5 ]</Text>
                    <View style={styles.hudRight}>
                        <Text style={styles.hudFrames}>
                            FRM:{frameCount}
                        </Text>
                        <View style={[
                            styles.statusDot,
                            { backgroundColor: tfReady ? COLORS.primary : COLORS.danger },
                        ]} />
                    </View>
                </View>

                {/* ===== PRECISION METER CARD ===== */}
                <View style={styles.precisionCard}>
                    <Text style={styles.precisionLabel}>PRECISION_METER</Text>
                    <View style={styles.precisionCircle}>
                        <View style={[
                            styles.precisionInner,
                            {
                                borderColor: getAccuracyColor(),
                                shadowColor: getAccuracyColor(),
                            },
                        ]}>
                            <Text style={[styles.precisionValue, { color: getAccuracyColor() }]}>
                                {Math.round(accuracy)}
                            </Text>
                            <Text style={styles.precisionPercent}>%</Text>
                        </View>
                    </View>
                    <Text style={[styles.precisionStatus, { color: getAccuracyColor() }]}>
                        {accuracy >= 70 ? 'OPTIMAL' : accuracy >= 50 ? 'DEGRADED' : 'CRITICAL'}
                    </Text>
                </View>

                {/* ===== JOINT STATUS TERMINAL ===== */}
                {jointStatus.length > 0 && (
                    <View style={styles.jointTerminal}>
                        <Text style={styles.terminalHeader}>
                            {'>'} JOINT_STATUS_v3.0
                        </Text>
                        <ScrollView style={styles.terminalScroll} nestedScrollEnabled>
                            {jointStatus.map((item, idx) => (
                                <View key={idx} style={styles.terminalRow}>
                                    <Text style={[styles.terminalJoint, { color: getSeverityColor(item.severity) }]}>
                                        {item.joint}
                                    </Text>
                                    <Text style={styles.terminalSeparator}> :: </Text>
                                    <Text style={[styles.terminalStatus, { color: getSeverityColor(item.severity) }]}>
                                        {item.status}
                                    </Text>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* ===== FORM ALERT BOX (Pulsing Red) ===== */}
                {hasError && alerts.length > 0 && (
                    <Animated.View style={[
                        styles.alertBox,
                        {
                            borderColor: alertBorderColor,
                            backgroundColor: alertBgColor,
                        },
                    ]}>
                        <Text style={styles.alertLabel}>⚠ FORM_ALERT</Text>
                        {alerts.slice(0, 3).map((alert, idx) => (
                            <Text key={idx} style={styles.alertText}>
                                {alert.message}
                            </Text>
                        ))}
                    </Animated.View>
                )}

                {/* ===== BOTTOM HUD ===== */}
                <View style={styles.hudBottom}>
                    {/* Status Feedback Box */}
                    <View style={[
                        styles.feedbackBox,
                        hasError && { borderColor: COLORS.danger },
                    ]}>
                        <Text style={styles.feedbackLabel}>LIVE_DIAGNOSTICS</Text>
                        <Text style={[
                            styles.feedbackText,
                            hasError && { color: COLORS.danger },
                        ]}>
                            {statusMessage}
                        </Text>
                        {isAnalyzing && slidingWindowRef.current.length < SEQUENCE_LENGTH && (
                            <View style={styles.bufferBar}>
                                <View style={[
                                    styles.bufferFill,
                                    { width: `${(slidingWindowRef.current.length / SEQUENCE_LENGTH) * 100}%` },
                                ]} />
                                <Text style={styles.bufferText}>
                                    BUFFER: {slidingWindowRef.current.length}/{SEQUENCE_LENGTH}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Controls */}
                    <View style={styles.controls}>
                        {!isAnalyzing ? (
                            <TouchableOpacity
                                style={styles.startBtn}
                                onPress={startAnalysis}
                                disabled={!tfReady}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.btnText}>INITIATE_ANALYSIS</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.stopBtn}
                                onPress={stopAnalysis}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.btnTextLight}>TERMINATE_LINK</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => navigation.goBack()}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.backText}>EXIT</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );
}


// ================================================================
//  STYLES
// ================================================================

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
    },

    // ---- Loading / Error ----
    loadingText: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 12,
        letterSpacing: 2,
        marginTop: 16,
        textAlign: 'center',
    },
    errorText: {
        color: COLORS.danger,
        fontFamily: FONTS.mono,
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 100,
        paddingHorizontal: 30,
    },
    errorSub: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 11,
        textAlign: 'center',
        marginTop: 8,
    },

    // ---- Camera ----
    cameraFrame: {
        flex: 1,
        position: 'relative',
    },
    camera: {
        flex: 1,
    },

    // ---- Scan Line ----
    scanLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: COLORS.primary,
        opacity: 0.4,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
        zIndex: 5,
    },

    // ---- Skeleton Overlay ----
    skeletonOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 4,
    },

    // ---- Top HUD ----
    hudTop: {
        position: 'absolute',
        top: 50,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
    },
    hudTitle: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontWeight: '900',
        fontSize: 13,
        letterSpacing: 2,
        textShadowColor: COLORS.primaryGlow,
        textShadowRadius: 8,
        textShadowOffset: { width: 0, height: 0 },
    },
    hudRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    hudFrames: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 10,
        letterSpacing: 1,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        shadowColor: COLORS.primary,
        shadowRadius: 8,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
    },

    // ---- Precision Meter Card ----
    precisionCard: {
        position: 'absolute',
        top: 90,
        right: 16,
        width: 100,
        alignItems: 'center',
        backgroundColor: COLORS.surfaceGlass,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingVertical: 12,
        paddingHorizontal: 8,
        zIndex: 15,
    },
    precisionLabel: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 7,
        fontWeight: '800',
        letterSpacing: 1.5,
        marginBottom: 8,
    },
    precisionCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 3,
        borderColor: COLORS.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
    },
    precisionInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
        elevation: 6,
    },
    precisionValue: {
        fontFamily: FONTS.mono,
        fontSize: 22,
        fontWeight: '900',
    },
    precisionPercent: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 10,
        fontWeight: '700',
        marginTop: -4,
    },
    precisionStatus: {
        fontFamily: FONTS.mono,
        fontSize: 8,
        fontWeight: '900',
        letterSpacing: 2,
    },

    // ---- Joint Status Terminal ----
    jointTerminal: {
        position: 'absolute',
        top: 90,
        left: 16,
        width: 200,
        maxHeight: 180,
        backgroundColor: COLORS.surfaceGlass,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 10,
        zIndex: 15,
    },
    terminalHeader: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 6,
        opacity: 0.7,
    },
    terminalScroll: {
        maxHeight: 140,
    },
    terminalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 2,
    },
    terminalJoint: {
        fontFamily: FONTS.mono,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
        width: 65,
    },
    terminalSeparator: {
        color: COLORS.textDim,
        fontFamily: FONTS.mono,
        fontSize: 10,
    },
    terminalStatus: {
        fontFamily: FONTS.mono,
        fontSize: 9,
        fontWeight: '700',
        flex: 1,
    },

    // ---- Form Alert Box (Pulsing) ----
    alertBox: {
        position: 'absolute',
        bottom: 220,
        left: 16,
        right: 16,
        borderWidth: 2,
        borderRadius: 8,
        padding: 14,
        zIndex: 20,
    },
    alertLabel: {
        color: COLORS.danger,
        fontFamily: FONTS.mono,
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 6,
    },
    alertText: {
        color: COLORS.white,
        fontFamily: FONTS.mono,
        fontSize: 11,
        fontWeight: '600',
        lineHeight: 18,
        marginBottom: 2,
    },

    // ---- Bottom HUD ----
    hudBottom: {
        position: 'absolute',
        bottom: 36,
        left: 16,
        right: 16,
        zIndex: 10,
    },
    feedbackBox: {
        backgroundColor: COLORS.surfaceGlass,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 14,
        borderRadius: 8,
        marginBottom: 14,
    },
    feedbackLabel: {
        color: COLORS.primary,
        fontFamily: FONTS.mono,
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 3,
        opacity: 0.7,
        marginBottom: 5,
    },
    feedbackText: {
        color: COLORS.white,
        fontFamily: FONTS.mono,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    bufferBar: {
        marginTop: 8,
        height: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative',
    },
    bufferFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: COLORS.primaryDim,
        borderRadius: 4,
    },
    bufferText: {
        color: COLORS.textMuted,
        fontFamily: FONTS.mono,
        fontSize: 8,
        fontWeight: '700',
        letterSpacing: 1,
        textAlign: 'center',
        lineHeight: 14,
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
    },
    startBtn: {
        flex: 2,
        backgroundColor: COLORS.primary,
        padding: 16,
        borderRadius: 6,
        alignItems: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 6,
    },
    stopBtn: {
        flex: 2,
        backgroundColor: COLORS.danger,
        padding: 16,
        borderRadius: 6,
        alignItems: 'center',
        shadowColor: COLORS.danger,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 12,
        elevation: 6,
    },
    backBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        padding: 16,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    btnText: {
        color: COLORS.bg,
        fontFamily: FONTS.mono,
        fontWeight: '900',
        fontSize: 12,
        letterSpacing: 1,
    },
    btnTextLight: {
        color: COLORS.white,
        fontFamily: FONTS.mono,
        fontWeight: '900',
        fontSize: 12,
        letterSpacing: 1,
    },
    backText: {
        color: COLORS.white,
        fontFamily: FONTS.mono,
        fontWeight: '700',
        fontSize: 12,
    },
});
