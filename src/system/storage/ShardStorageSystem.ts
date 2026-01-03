import { Log } from "utils/logger/Logger";
import { registerResetFunction } from "utils/SystemResetter";
import { RoomStorageSystem } from "./RoomStorageSystem";

class ShardStorageSystem {
    private roomStorageSystems: { [roomName: string]: RoomStorageSystem } = {};

    _scanStorageSystems() {
        // Log.d("Rescanning storage rooms");

        //Check for registered rooms that are dead
        for (let system of Object.values(this.roomStorageSystems)) {
            if (!Game.rooms[system.roomName] || !Game.rooms[system.roomName].controller?.my) {
                Log.w(
                    `Unregistering storage system in room:${system.roomName} as the controller is no longer under our control`
                );
            }
        }

        //Check for new or unregistered rooms
        for (let room of Object.values(Game.rooms)) {
            if (room.controller?.my && !this.roomStorageSystems[room.name]) {
                Log.i("Creating storage system for room: " + room.name);
                this.roomStorageSystems[room.name] = new RoomStorageSystem(room);
            }
        }
    }

    _postAnalyticsEvent(roomName: string, value: number, ...categories: string[]) {
        if (this.roomStorageSystems[roomName])
            this.roomStorageSystems[roomName]._postAnalyticsEvent(value, ...categories);
    }

    _getAnalyticsValue(roomName: string, category: string) {
        if (this.roomStorageSystems[roomName]) return this.roomStorageSystems[roomName]._getAnalyticsValue(category);
        else return 0;
    }

    _getMainStorage(roomName: string): MainStorage | undefined {
        return this.roomStorageSystems[roomName]._getMainStorage();
    }

    _totalAnalytics(): void {
        Object.values(this.roomStorageSystems).forEach(s => s._totalAnalytics());
    }

    _visualize(): void {
        Object.values(this.roomStorageSystems).forEach(s => s._visualize());
    }
}

export let _shardStorageSystem: ShardStorageSystem = new ShardStorageSystem();
registerResetFunction(() => (_shardStorageSystem = new ShardStorageSystem()));
