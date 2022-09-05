import { _shardHaulerSystem } from "./ShardHaulerSystem";

export function registerHaulingProvider(roomName: string, id: string, provider: LogisticsNodeProvidor) {
    _shardHaulerSystem._registerNodeProvider(roomName, id, provider);
}

export function unregisterHaulingProvider(roomName: string, id: string) {
    _shardHaulerSystem._unregisterNodeProvider(roomName, id);
}
