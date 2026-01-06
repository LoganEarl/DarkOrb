import { registerResetFunction } from "utils/SystemResetter";
import { Log } from "utils/logger/Logger";

interface NodeCollection {
    nodeIdsByProvider: { [providerId: string]: Set<string> };
    logisticsNodes: { [id: string]: LogisticsNode };
}

var nodesByRoomName: { [roomName: string]: NodeCollection } = {};

registerResetFunction(() => (nodesByRoomName = {}));

export function getNodes(roomName: string): { [id: string]: LogisticsNode } {
    return nodesByRoomName[roomName]?.logisticsNodes ?? {};
}

export function clearExpiredNodes() {
    //Ah yes, A pyramid of doom. My favorite
    for (let roomName in nodesByRoomName) {
        let nodes = nodesByRoomName[roomName]
        if (!nodes) continue

        for (let providerId in nodes.nodeIdsByProvider) {
            for (let nodeId of nodes.nodeIdsByProvider[providerId].values()) {
                let node = nodes.logisticsNodes[nodeId]
                if (node && node.invalidateAfter && Game.time > node.invalidateAfter) {
                    unregisterNode(roomName, providerId, nodeId);
                }
            }
        }
    }
}

export function getNodesByProvider(roomName: string, providerId: string): LogisticsNode[] {
    let nodeIds = nodesByRoomName?.[roomName].nodeIdsByProvider[providerId];
    let nodes: LogisticsNode[] = []
    if (nodeIds) {
        nodeIds.forEach(id => {
            let node = nodesByRoomName[roomName].logisticsNodes[id];
            if (node)
                nodes.push(node)
        })
    }
    return nodes
}

export function registerNode(roomName: string, providerId: string, node: LogisticsNode) {
    if (!nodesByRoomName[roomName]) nodesByRoomName[roomName] = {
        nodeIdsByProvider: {},
        logisticsNodes: {}
    };

    nodesByRoomName[roomName].logisticsNodes[node.nodeId] = node;

    if (nodesByRoomName[roomName].nodeIdsByProvider[providerId] === undefined)
        nodesByRoomName[roomName].nodeIdsByProvider[providerId] = new Set<string>();

    nodesByRoomName[roomName].nodeIdsByProvider[providerId].add(node.nodeId);
}

//Get node instance back for updates
export function getNode(roomName: string, nodeId: string): LogisticsNode | undefined {
    return nodesByRoomName[roomName]?.logisticsNodes[nodeId];
}

export function unregisterNodes(roomName: string, providerId: string) {
    let nodes = nodesByRoomName[roomName];
    if (nodes?.nodeIdsByProvider[providerId]) {
        for (let nodeId of nodes.nodeIdsByProvider[providerId].values()) {
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
