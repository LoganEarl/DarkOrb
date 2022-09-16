import { _shardHaulerSystem } from "./ShardHaulerSystem";

export function registerNode(roomName: string, providerId: string, node: LogisticsNode) {
    _shardHaulerSystem._registerNode(roomName, providerId, node);
}

//Get node instance back for updates
export function getNode(roomName: string, nodeId: string): LogisticsNode | undefined {
    return _shardHaulerSystem._getNode(roomName, nodeId);
}

export function unregisterNodes(roomName: string, providerId: string) {
    _shardHaulerSystem._unregisterNodes(roomName, providerId);
}

export function unregisterNode(roomName: string, providerId: string, nodeId: string) {
    _shardHaulerSystem._unregisterNode(roomName, providerId, nodeId);
}
