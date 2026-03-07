import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, DrawerActions } from '@react-navigation/native';

const CustomHeader = ({ title }) => {
    const navigation = useNavigation();

    return (
        <View style={styles.header}>
            <TouchableOpacity
                style={styles.menuBtn}
                onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            >
                <View style={styles.hamburger}>
                    <View style={styles.line} />
                    <View style={[styles.line, { marginVertical: 4 }]} />
                    <View style={styles.line} />
                </View>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{title.toUpperCase()}</Text>
            <View style={{ width: 40 }} />
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 15,
        backgroundColor: '#000',
        borderBottomWidth: 1,
        borderColor: '#1a1a1a'
    },
    menuBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    hamburger: {
        width: 24,
    },
    line: {
        height: 2,
        backgroundColor: '#39FF14',
        width: '100%',
        borderRadius: 1
    },
    headerTitle: {
        color: '#39FF14',
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: 2
    }
});

export default CustomHeader;
