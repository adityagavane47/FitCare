import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';

/**
 * useInteractionReady — Screen Transition Protection Hook
 *
 * Returns `isReady = true` only AFTER all running animations
 * (e.g. stack / drawer slide transitions) have completed.
 *
 * Usage:
 *   const isReady = useInteractionReady();
 *   useEffect(() => { if (isReady) fetchData(); }, [isReady]);
 */
export default function useInteractionReady() {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const handle = InteractionManager.runAfterInteractions(() => {
            setIsReady(true);
        });

        return () => handle.cancel();
    }, []);

    return isReady;
}
