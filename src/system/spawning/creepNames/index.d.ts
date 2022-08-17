interface ManifestMemory {
    previousNameIndex: number
    creepNamesByHandle: {[handle: string]: string[]}
}

interface Memory {
    manifestMemory?: ManifestMemory
}