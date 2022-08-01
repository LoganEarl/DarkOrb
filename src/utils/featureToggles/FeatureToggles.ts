var featureCache: { [feature: string]: boolean } = {};

export function getFeature(feature: string): boolean {
    if (!featureCache[feature]) {
        featureCache[feature] = (Memory.featureToggles ?? {})[feature] ?? false;
    }
    return featureCache[feature];
}

export function setFeature(feature: string, enabled: boolean) {
    featureCache[feature] = enabled;
    if (!Memory.featureToggles) Memory.featureToggles = {};
    Memory.featureToggles[feature] = enabled;
}

export function toggleFeature(feature: string): boolean {
    setFeature(feature, !getFeature(feature));
    return getFeature(feature);
}
