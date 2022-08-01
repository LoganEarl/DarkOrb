export function hash(unkType: any, exclude?: any): string | undefined {
    let ex = exclude;
    if (ex === undefined) {
        ex = [];
    }
    if (!isNaN(unkType) && typeof unkType !== "string") {
        return unkType;
    }
    switch (typeof unkType) {
        case "object":
            return objectHash(unkType, ex);
        default:
            return stringHash(String(unkType));
    }
}

function stringHash(string: any, noType?: boolean): string {
    let hashString = string;
    if (!noType) {
        hashString = `string${string}`;
    }
    var hash = 0;
    for (var i = 0; i < hashString.length; i++) {
        var character = hashString.charCodeAt(i);
        hash = (hash << 5) - hash + character;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash + "";
}

function objectHash(obj: any, exclude: any): string | undefined {
    if (exclude.indexOf(obj) > -1) {
        return undefined;
    }
    let hashValue = "";
    const keys = Object.keys(obj).sort();
    for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const keyHash = hash(key);
        const attrHash = hash(obj[key], exclude);
        exclude.push(obj[key]);
        hashValue += stringHash(`object${keyHash}${attrHash}`, true);
    }
    return stringHash(hash, true);
}
