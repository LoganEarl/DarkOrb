import { registerResetFunction } from "utils/SystemResetter";

interface NodeCollection {
    nodeIdsByProvider: { [providerId: string]: Set<string> };
    logisticsNodes: { [id: string]: LogisticsNode };
}

var nodesByRoomName: { [roomName: string]: NodeCollection } = {};

registerResetFunction(() => (nodesByRoomName = {}));

export function getNodes(roomName: string): { [id: string]: LogisticsNode } {
    return nodesByRoomName[roomName]?.logisticsNodes ?? {};
}

export function registerNode(roomName: string, providerId: string, node: LogisticsNode) {
    if (!nodesByRoomName[roomName]) nodesByRoomName[roomName] = { nodeIdsByProvider: {}, logisticsNodes: {} };

    nodesByRoomName[roomName].logisticsNodes[node.nodeId] = node;

    if (!nodesByRoomName[roomName].nodeIdsByProvider[providerId])
        nodesByRoomName[roomName].nodeIdsByProvider[providerId] = new Set();
    nodesByRoomName[roomName].nodeIdsByProvider[providerId].add(providerId);
}

//Get node instance back for updates
export function getNode(roomName: string, nodeId: string): LogisticsNode | undefined {
    return nodesByRoomName[roomName]?.logisticsNodes[nodeId];
}

export function unregisterNodes(roomName: string, providerId: string) {
    let nodes = nodesByRoomName[roomName];
    if (nodes?.nodeIdsByProvider[providerId]) {
        for (let nodeId of nodes.nodeIdsByProvider[providerId]) {
            delete nodes.logisticsNodes[nodeId];
        }
        nodes.nodeIdsByProvider[providerId].clear();
    }
}

export function unregisterNode(roomName: string, providerId: string, nodeId: string) {
    let nodes = nodesByRoomName[roomName];
    if (nodes) {
        delete nodes.logisticsNodes[nodeId];
        nodes.nodeIdsByProvider[providerId]?.delete(nodeId);
    }
}
