import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * CyberButton — Reusable Cyberpunk Button with Haptic Feedback
 *
 * Props:
 *   label       - Button text (rendered uppercase)
 *   onPress     - Standard press handler
 *   onLongPress - Long-press handler (optional)
 *   destructive - If true, uses Heavy haptics + red border on press
 *   disabled    - Disables button
 *   style       - Additional style overrides for the container
 */
export default function CyberButton({
    label,
    onPress,
    onLongPress,
    destructive = false,
    disabled = false,
    style,
}) {
    const handlePress = () => {
        // Light pulse for standard actions, Heavy for destructive
        if (destructive) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.();
    };

    const handleLongPress = () => {
        // Long-press always fires Heavy feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onLongPress?.();
    };

    return (
        <TouchableOpacity
            style={[
                styles.button,
                destructive && styles.destructive,
                disabled && styles.disabled,
                style,
            ]}
            onPress={handlePress}
            onLongPress={onLongPress ? handleLongPress : undefined}
            disabled={disabled}
            activeOpacity={0.7}
        >
            <Text
                style={[
                    styles.text,
                    destructive && styles.destructiveText,
                    disabled && styles.disabledText,
                ]}
            >
                {label}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        backgroundColor: '#121212',
        borderWidth: 1.5,
        borderColor: '#39FF14',
        borderRadius: 4,
        paddingVertical: 16,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
        // Neon glow shadow
        shadowColor: '#39FF14',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    destructive: {
        borderColor: '#FF3131',
        shadowColor: '#FF3131',
    },
    disabled: {
        opacity: 0.4,
        shadowOpacity: 0,
    },
    text: {
        color: '#39FF14',
        fontWeight: '900',
        fontSize: 14,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    destructiveText: {
        color: '#FF3131',
    },
    disabledText: {
        color: '#555',
    },
});
