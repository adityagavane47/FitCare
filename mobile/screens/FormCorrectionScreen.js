import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import { getWebSocketUrl } from '../services/api';

const { width, height } = Dimensions.get('window');

// Cyberpunk Color Palette
const COLORS = {
    background: '#121212',      // Charcoal
    primary: '#39FF14',         // Neon Green
    danger: '#FF3131',          // Neon Red
    white: '#FFFFFF',
    overlay: 'rgba(57, 255, 20, 0.1)',
};

// Number words for speech
const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

export default function FormCorrectionScreen({ route, navigation }) {
    const { userId, exerciseType = 'pushup' } = route.params || { userId: 1 };

    const [hasPermission, setHasPermission] = useState(null);
    const [feedback, setFeedback] = useState("Establishing Uplink...");
    const [wsConnected, setWsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [repCount, setRepCount] = useState(0);
    const [debugElbow, setDebugElbow] = useState(0);
    const [debugBack, setDebugBack] = useState(0);

    const cameraRef = useRef(null);
    const wsRef = useRef(null);
    const streamIntervalRef = useRef(null);
    const lastSpokenRef = useRef(0);

    useEffect(() => {
        // Request Camera Permission
        (async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted');
        })();

        // Initialize WebSocket connection to Python backend
        const wsUrl = getWebSocketUrl('/ws/form-tracker');
        console.log(`[WS] Connecting to ${wsUrl}`);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WS] Connected to MediaPipe backend');
            setWsConnected(true);
            setFeedback("UPLINK_STABLE. Get into position...");
        };

        ws.onmessage = (e) => {
            try {
                const response = JSON.parse(e.data);
                if (response.status === "success") {
                    const msg = response.feedback;
                    const count = response.count || 0;

                    // Update rep count from server
                    setRepCount(count);
                    setFeedback(msg.toUpperCase());

                    // Update debug HUD angles
                    setDebugElbow(response.elbow_angle ?? 0);
                    setDebugBack(response.back_angle ?? 0);

                    // ========== SMART AUDIO ENGINE ==========
                    const now = Date.now();
                    const isNumber = /^\d+$/.test(msg);

                    if (isNumber) {
                        // REP COMPLETED - Speak immediately (no throttle)
                        const num = parseInt(msg, 10);
                        const word = NUMBER_WORDS[num] || msg;
                        Speech.speak(word, { rate: 1.0, pitch: 1.0 });
                        lastSpokenRef.current = now;
                    } else if (msg !== 'No person detected' && msg !== 'Good form') {
                        // TEXT WARNING - Apply 3-second throttle
                        if (now - lastSpokenRef.current > 3000) {
                            Speech.speak(msg, { rate: 0.9, pitch: 0.8 });
                            lastSpokenRef.current = now;
                        }
                    }
                }
            } catch (err) {
                console.error("[WS Message Error]", err);
            }
        };

        ws.onerror = (e) => {
            console.error("[WS Error]", e.message);
            setFeedback("UPLINK_ERROR. Check backend.");
        };

        ws.onclose = () => {
            console.log('[WS] Connection closed');
            setWsConnected(false);
            setFeedback("UPLINK_TERMINATED");
        };

        wsRef.current = ws;

        // Cleanup function: clear interval and close WebSocket
        return () => {
            if (streamIntervalRef.current) {
                clearInterval(streamIntervalRef.current);
                streamIntervalRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, []);

    const startStreaming = () => {
        if (!cameraRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
        }

        console.log("[Stream] Initiating Frame Capture");
        setFeedback("ANALYSIS_LIVE");
        setIsStreaming(true);
        setRepCount(0); // Reset rep count when starting

        // Camera Stream: Capture frame every 1000ms (~1 FPS) to reduce memory pressure
        streamIntervalRef.current = setInterval(async () => {
            if (cameraRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                try {
                    const photo = await cameraRef.current.takePictureAsync({
                        quality: 0.1,           // Low quality JPEG compression
                        base64: true,           // Get base64 string
                        skipProcessing: true,   // Skip image processing for faster capture
                        shutterSound: false,    // Disable camera click sound
                        exif: false,            // Don't include EXIF data
                        imageType: 'jpg'        // Force JPG format
                    });

                    // Only send if we got valid data
                    if (photo && photo.base64) {
                        wsRef.current.send(photo.base64);
                    }
                } catch (err) {
                    console.error("[Frame Capture Error]", err.message);
                }
            }
        }, 1000);
    };

    const stopStreaming = () => {
        if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
        }
        setIsStreaming(false);
        setFeedback("ANALYSIS_PAUSED");
    };

    // Loading state
    if (hasPermission === null) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    // Permission denied
    if (hasPermission === false) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>BIOMETRIC_ERROR: Camera access denied.</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.cameraFrame}>
                <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing="front"
                    pictureSize="640x480"
                    onCameraReady={() => {
                        console.log("[Camera] Ready");
                    }}
                />

                {/* MASSIVE REP COUNTER - Top Center */}
                <View style={styles.repCounterContainer}>
                    <Text style={styles.repLabel}>REPS</Text>
                    <Text style={styles.repCount}>{repCount}</Text>
                </View>

                {/* Visual Debugger HUD - Top Right */}
                <View style={styles.debugHud}>
                    <Text style={styles.debugText}>SYS.DEBUG.ELBOW :: {debugElbow}°</Text>
                    <Text style={styles.debugText}>SYS.DEBUG.BACK  :: {debugBack}°</Text>
                </View>

                {/* Cyberpunk HUD - Top Overlay */}
                <View style={styles.hudTop}>
                    <Text style={styles.hudTitle}>[ FORM_TRACKER_V4 ]</Text>
                    <View style={[
                        styles.statusDot,
                        { backgroundColor: wsConnected ? COLORS.primary : COLORS.danger }
                    ]} />
                </View>

                {/* Cyberpunk HUD - Bottom Overlay */}
                <View style={styles.hudBottom}>
                    <View style={styles.feedbackBox}>
                        <Text style={styles.feedbackLabel}>LIVE_DIAGNOSTICS</Text>
                        <Text style={styles.feedbackText}>{feedback}</Text>
                    </View>

                    <View style={styles.controls}>
                        {!isStreaming ? (
                            <TouchableOpacity
                                style={styles.startBtn}
                                onPress={startStreaming}
                                disabled={!wsConnected}
                            >
                                <Text style={styles.btnText}>INITIATE_TRACKING</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.stopBtn}
                                onPress={stopStreaming}
                            >
                                <Text style={styles.btnText}>TERMINATE_LINK</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => navigation.goBack()}
                        >
                            <Text style={styles.backText}>EXIT</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background
    },
    cameraFrame: {
        flex: 1,
        position: 'relative'
    },
    camera: {
        flex: 1
    },
    // MASSIVE REP COUNTER STYLES
    repCounterContainer: {
        position: 'absolute',
        top: 100,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 20
    },
    repLabel: {
        color: COLORS.primary,
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 8,
        opacity: 0.8
    },
    repCount: {
        color: COLORS.primary,
        fontSize: 120,
        fontWeight: '900',
        textShadowColor: COLORS.primary,
        textShadowRadius: 30,
        textShadowOffset: { width: 0, height: 0 }
    },
    hudTop: {
        position: 'absolute',
        top: 50,
        left: 20,
        right: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10
    },
    hudTitle: {
        color: COLORS.primary,
        fontWeight: '900',
        fontSize: 14,
        letterSpacing: 2
    },
    statusDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        shadowColor: COLORS.primary,
        shadowRadius: 10,
        shadowOpacity: 1
    },
    hudBottom: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
        zIndex: 10
    },
    feedbackBox: {
        backgroundColor: COLORS.overlay,
        borderWidth: 1,
        borderColor: COLORS.primary,
        padding: 15,
        borderRadius: 4,
        marginBottom: 20,
        alignItems: 'center'
    },
    feedbackLabel: {
        color: COLORS.primary,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 3,
        opacity: 0.7,
        marginBottom: 5
    },
    feedbackText: {
        color: COLORS.white,
        fontSize: 22,
        fontWeight: '900',
        textAlign: 'center'
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10
    },
    startBtn: {
        flex: 2,
        backgroundColor: COLORS.primary,
        padding: 18,
        borderRadius: 4,
        alignItems: 'center'
    },
    stopBtn: {
        flex: 2,
        backgroundColor: COLORS.danger,
        padding: 18,
        borderRadius: 4,
        alignItems: 'center'
    },
    backBtn: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 18,
        borderRadius: 4,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)'
    },
    btnText: {
        color: COLORS.background,
        fontWeight: '900',
        fontSize: 13,
        letterSpacing: 1
    },
    backText: {
        color: COLORS.white,
        fontWeight: '700',
        fontSize: 13
    },
    errorText: {
        color: COLORS.danger,
        textAlign: 'center',
        marginTop: 100,
        fontWeight: 'bold'
    },
    // ===== VISUAL DEBUGGER HUD =====
    debugHud: {
        position: 'absolute',
        top: 50,
        right: 12,
        backgroundColor: 'rgba(18, 18, 18, 0.8)',
        borderWidth: 1,
        borderColor: '#FFFF00',
        borderRadius: 4,
        paddingVertical: 8,
        paddingHorizontal: 12,
        zIndex: 30
    },
    debugText: {
        color: '#FFFF00',
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: '700',
        letterSpacing: 1,
        lineHeight: 18
    }
});
