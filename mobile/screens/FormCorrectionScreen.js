import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';

const { width, height } = Dimensions.get('window');

// Cyberpunk Color Palette
const COLORS = {
    background: '#121212',      // Charcoal
    primary: '#39FF14',         // Neon Green
    danger: '#FF3131',          // Neon Red
    white: '#FFFFFF',
    overlay: 'rgba(57, 255, 20, 0.1)',
};

// Your backend server IP address
const BACKEND_IP = '192.168.1.7';

export default function FormCorrectionScreen({ route, navigation }) {
    const { userId, exerciseType = 'pushup' } = route.params || { userId: 1 };

    const [hasPermission, setHasPermission] = useState(null);
    const [feedback, setFeedback] = useState("Establishing Uplink...");
    const [wsConnected, setWsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);

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
        const wsUrl = `ws://${BACKEND_IP}:8000/ws/form-tracker`;
        console.log(`[WS] Connecting to ${wsUrl}`);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WS] Connected to MediaPipe backend');
            setWsConnected(true);
            setFeedback("UPLINK_STABLE. Align body...");
        };

        ws.onmessage = (e) => {
            try {
                const response = JSON.parse(e.data);
                if (response.status === "success") {
                    const msg = response.feedback;
                    setFeedback(msg.toUpperCase());

                    // Throttle Speech: Minimum 3 second interval to prevent overlap
                    const now = Date.now();
                    const shouldSpeak = msg !== 'No person detected';

                    if (shouldSpeak && now - lastSpokenRef.current > 3000) {
                        Speech.speak(msg, { rate: 0.9, pitch: 0.8 });
                        lastSpokenRef.current = now;
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

        // Camera Stream Hack: Capture frame every 500ms (~2 FPS)
        streamIntervalRef.current = setInterval(async () => {
            if (cameraRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                try {
                    const photo = await cameraRef.current.takePictureAsync({
                        quality: 0.1,           // Low quality for speed
                        base64: true,           // Get base64 string
                        skipProcessing: true,   // Skip image processing for faster capture
                        shutterSound: false     // Disable camera click sound
                    });

                    // Send base64 image data over WebSocket
                    wsRef.current.send(photo.base64);
                } catch (err) {
                    console.error("[Frame Capture Error]", err);
                }
            }
        }, 500);
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
                    onCameraReady={() => {
                        console.log("[Camera] Ready");
                    }}
                />

                {/* Cyberpunk HUD - Top Overlay */}
                <View style={styles.hudTop}>
                    <Text style={styles.hudTitle}>[ MEDIA_PIPE_CORE_V3 ]</Text>
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
    }
});
