import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ImageBackground } from 'react-native';
import { Colors } from '../constants/Colors';
import CustomHeader from '../components/CustomHeader';

const { width } = Dimensions.get('window');

const AIVisionScreen = ({ navigation, route }) => {
    const { userId } = route.params || { userId: 1 };

    const protocols = [
        { id: 'pushup', label: 'PUSHUP_PROTOCOL', icon: '💪', description: 'Monitor depth and hip alignment.' },
        { id: 'squat', label: 'SQUAT_PROTOCOL', icon: '🦵', description: 'Track knee angle and vertical form.' },
    ];

    return (
        <View style={styles.container}>
            <CustomHeader title="Vision Hub" />

            <View style={styles.header}>
                <Text style={styles.glitchText}>V4.0_SCANNER</Text>
                <View style={styles.statusLine} />
            </View>

            <View style={styles.content}>
                <Text style={styles.sectionTitle}>SELECT_UPLINK_TARGET</Text>

                {protocols.map((p) => (
                    <TouchableOpacity
                        key={p.id}
                        style={styles.scanCard}
                        onPress={() => navigation.navigate('FormCorrection', { userId, exerciseType: p.id })}
                    >
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardIcon}>{p.icon}</Text>
                            <Text style={styles.cardLabel}>{p.label}</Text>
                        </View>
                        <Text style={styles.cardDesc}>{p.description}</Text>
                        <View style={styles.scanLine} />
                    </TouchableOpacity>
                ))}

                <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                        SYSTEM_NOTICE: Ensure adequate lighting and vertical device orientation for optimal pose estimation.
                    </Text>
                </View>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerBrand}>FITCARE // NEURAL_NET_HUB</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { paddingHorizontal: 25, marginTop: 30, marginBottom: 40 },
    glitchText: { color: '#39FF14', fontSize: 24, fontWeight: '900', letterSpacing: 4, textShadowColor: '#39FF14', textShadowRadius: 10 },
    statusLine: { height: 2, backgroundColor: '#39FF14', width: 100, marginTop: 8, opacity: 0.5 },
    content: { flex: 1, paddingHorizontal: 25 },
    sectionTitle: { color: '#6d6d80', fontSize: 10, fontWeight: '800', marginBottom: 25, letterSpacing: 5 },
    scanCard: {
        backgroundColor: '#0a0a0a',
        borderWidth: 1,
        borderColor: '#1a1a1a',
        borderRadius: 8,
        padding: 25,
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden'
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    cardIcon: { fontSize: 24, marginRight: 15 },
    cardLabel: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
    cardDesc: { color: '#666', fontSize: 12, lineHeight: 18, fontWeight: '600' },
    scanLine: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: '#39FF1433',
    },
    warningBox: { marginTop: 20, borderLeftWidth: 2, borderLeftColor: '#F00', paddingLeft: 15 },
    warningText: { color: '#FF0042', fontSize: 11, fontWeight: '800', opacity: 0.8, letterSpacing: 1 },
    footer: { padding: 30, alignItems: 'center' },
    footerBrand: { color: '#333', fontSize: 10, fontWeight: '900', letterSpacing: 3 }
});

export default AIVisionScreen;
