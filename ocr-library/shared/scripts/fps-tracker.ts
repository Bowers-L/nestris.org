/**
 * FpsTracker class for tracking the frames per second (FPS) in a real-time application.
 * This class provides a way to measure the rate at which a certain operation (or 'tick') is performed.
 * 
 * Methods:
 *   tick(): Called at each operation or 'tick'. This method records the current time of each tick.
 *   getFPS(): Calculates and returns the average number of ticks per second over the last second.
 **/

import { RollingAverage } from "./rolling-average";
import { sleep } from "./sleep";


export class FpsTracker {
    private timestamps: number[];
    private averageFPS = new RollingAverage(20);
    private averageTickBusyDuration = new RollingAverage(20);
    private averageTickIdleDuration = new RollingAverage(20);

    private tickLengths = new RollingAverage(100);

    private lastTick = Date.now();

    private i = 0;

    constructor(private readonly printEvery: number | undefined = undefined, private readonly printStats: boolean = false) {
        this.timestamps = [];
    }

    tick(): void {
        const now = Date.now();
        this.timestamps.push(now);

        if (this.timestamps.length >= 2) {
            const tickLength = now - this.timestamps[this.timestamps.length - 2];
            this.tickLengths.push(tickLength);
        }

        // Clean up timestamps older than 1 second
        while (this.timestamps.length > 0 && now - this.timestamps[0] > 1000) {
            this.timestamps.shift();
        }

        const fps = this.timestamps.length;
        this.averageFPS.push(fps);

        this.lastTick = now;

        if (this.printEvery) {
            this.i++;
            if (this.i == this.printEvery) {
                console.log("FPS:", this.getFPS());
                if (this.printStats) console.log(this.getTickDurationStatistics());
                this.i = 0;
            }
        }
    }

    endTick(): void {
        const tickBusyDuration = Date.now() - this.lastTick;
        this.averageTickBusyDuration.push(tickBusyDuration);
    }

    async idleToMaintainFPS(fps: number) {
        const now = Date.now();
        const tickIdleDuration = 1000 / fps - (now - this.lastTick);

        if (tickIdleDuration > 0) {
            await sleep(tickIdleDuration);
            const actualIdleDuration = Date.now() - now;
            this.averageTickIdleDuration.push(actualIdleDuration);
        } else {
            this.averageTickIdleDuration.push(0);
        }

    }

    getFPS(): number {
        return this.averageFPS.get();
    }

    // returns the average duration of a tick (between tick() and endTick()) in milliseconds
    getTickBusyDuration(): number {
        return this.averageTickBusyDuration.get();
    }

    // returns the average duration of the idle time between ticks in milliseconds
    getTickIdleDuration(): number {
        return this.averageTickIdleDuration.get();
    }

    getTickDurationStatistics() {
        return this.tickLengths.getStatistics();
    }
}