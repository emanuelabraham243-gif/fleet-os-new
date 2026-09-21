/**
 * GPS abstraction. Single swap point: getGpsProvider().
 * Future adapters (implement GpsProvider): REST polling, webhook receiver,
 * MQTT subscriber, TCP listener (raw tracker protocols), CSV import.
 * V1 ships only the deterministic mock below; no vehicle location is ever
 * claimed beyond the last reported signal.
 */

export type GpsState = 'LIVE' | 'DELAYED' | 'OFFLINE' | 'UNKNOWN';

export interface GpsPosition {
  vehicleId: string;
  deviceId: string | null;
  timestamp: string | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  ignition: boolean | null;
  odometerKm: number | null;
}

export interface GpsProvider {
  readonly name: string;
  getLatest(vehicleIds: string[]): Promise<GpsPosition[]>;
}

export function classifySignal(
  timestamp: string | null,
  nowMs: number = Date.now(),
): { state: GpsState; minutesAgo: number | null } {
  if (!timestamp) return { state: 'UNKNOWN', minutesAgo: null };
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return { state: 'UNKNOWN', minutesAgo: null };
  const minutes = (nowMs - t) / 60_000;
  if (minutes < -2) return { state: 'UNKNOWN', minutesAgo: null };
  const minutesAgo = Math.max(0, Math.floor(minutes));
  if (minutes <= 5) return { state: 'LIVE', minutesAgo };
  if (minutes <= 60) return { state: 'DELAYED', minutesAgo };
  return { state: 'OFFLINE', minutesAgo };
}

const AGES_MIN: (number | null)[] = [2, 47, 300, null];

export class MockGpsProvider implements GpsProvider {
  readonly name = 'mock';

  async getLatest(vehicleIds: string[]): Promise<GpsPosition[]> {
    const now = Date.now();
    return vehicleIds.map((vehicleId, i) => {
      const age = AGES_MIN[i % AGES_MIN.length];
      return {
        vehicleId,
        deviceId: `MOCK-${i + 1}`,
        timestamp: age == null ? null : new Date(now - age * 60_000).toISOString(),
        latitude: 9.005 + (i % 7) * 0.006,
        longitude: 38.763 + (i % 5) * 0.008,
        speedKph: age === 2 ? 42 : 0,
        heading: (i * 47) % 360,
        ignition: age === 2,
        odometerKm: null,
      };
    });
  }
}

export function getGpsProvider(): GpsProvider {
  return new MockGpsProvider();
}
