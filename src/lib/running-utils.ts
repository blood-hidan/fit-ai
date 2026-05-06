/**
 * Running utilities with precise calorie calculation and GPS tracking
 */

export interface GeoPoint {
  lat: number;
  lng: number;
  t: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
}

export interface RunStats {
  distance: number; // meters
  duration: number; // seconds
  calories: number;
  avgPace: number; // seconds per km
  avgSpeed: number; // km/h
  maxSpeed: number; // km/h
  elevationGain: number; // meters
  elevationLoss: number; // meters
}

/**
 * Haversine formula - calculates distance between two GPS points in meters
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (x: number) => (x * Math.PI) / 180;
  
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  
  const h = Math.sin(dLat / 2) ** 2 + 
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Calculate speed between two points in km/h
 */
export function calculateSpeed(a: GeoPoint, b: GeoPoint): number {
  const distance = haversineDistance(a, b); // meters
  const time = (b.t - a.t) / 1000; // seconds
  
  if (time <= 0) return 0;
  
  return (distance / time) * 3.6; // Convert m/s to km/h
}

/**
 * MET (Metabolic Equivalent of Task) values for running by speed
 * Based on Compendium of Physical Activities
 */
function getRunningMET(speedKmh: number): number {
  if (speedKmh < 6) return 6.0;      // Slow jogging / fast walk
  if (speedKmh < 8) return 8.3;      // Light jogging (7.5 min/km)
  if (speedKmh < 9.5) return 9.8;    // Jogging (6.5 min/km)
  if (speedKmh < 11) return 10.5;    // Running (6 min/km)
  if (speedKmh < 12.5) return 11.5;  // Running (5 min/km)
  if (speedKmh < 14) return 12.8;    // Fast running (4.5 min/km)
  if (speedKmh < 16) return 14.5;    // Very fast (4 min/km)
  return 16.0;                        // Sprint (< 4 min/km)
}

/**
 * Calculate calories burned during running
 * Formula: Calories = MET * weight(kg) * duration(hours) * 1.05 (terrain factor)
 * 
 * @param weightKg - User weight in kg
 * @param durationSeconds - Run duration in seconds
 * @param distanceMeters - Total distance in meters
 * @param elevationGain - Total elevation gain in meters (optional)
 */
export function calculateRunningCalories(
  weightKg: number,
  durationSeconds: number,
  distanceMeters: number,
  elevationGain: number = 0
): number {
  if (durationSeconds <= 0 || distanceMeters <= 0) return 0;
  
  // Calculate average speed
  const durationHours = durationSeconds / 3600;
  const distanceKm = distanceMeters / 1000;
  const avgSpeedKmh = distanceKm / durationHours;
  
  // Get MET based on speed
  const baseMET = getRunningMET(avgSpeedKmh);
  
  // Elevation adjustment: +0.1 MET per 10m elevation gain per km
  const elevationFactor = elevationGain > 0 
    ? (elevationGain / distanceKm) * 0.01 
    : 0;
  
  const adjustedMET = baseMET + elevationFactor;
  
  // Calculate calories
  // Standard formula: Calories = MET × weight(kg) × time(hours)
  const calories = adjustedMET * weightKg * durationHours;
  
  return Math.round(calories);
}

/**
 * Filter GPS noise using Kalman-like simple averaging
 * Filters out points with poor accuracy or unrealistic speed
 */
export function filterGPSNoise(
  newPoint: GeoPoint,
  lastPoint: GeoPoint | null,
  options: {
    minAccuracy?: number;      // Minimum acceptable accuracy in meters
    maxSpeed?: number;         // Maximum realistic speed in km/h
    minDistance?: number;      // Minimum distance to consider movement
  } = {}
): { accept: boolean; distance: number; speed: number } {
  const {
    minAccuracy = 30,         // Ignore points with accuracy > 30m
    maxSpeed = 45,            // Max 45 km/h (unrealistic for running)
    minDistance = 2,          // Ignore movements < 2m (GPS noise)
  } = options;

  // Check accuracy if available
  if (newPoint.accuracy && newPoint.accuracy > minAccuracy) {
    return { accept: false, distance: 0, speed: 0 };
  }

  // If no last point, accept the first valid point
  if (!lastPoint) {
    return { accept: true, distance: 0, speed: 0 };
  }

  // Calculate distance and speed
  const distance = haversineDistance(lastPoint, newPoint);
  const speed = calculateSpeed(lastPoint, newPoint);

  // Filter out noise (too small movements)
  if (distance < minDistance) {
    return { accept: false, distance: 0, speed: 0 };
  }

  // Filter out unrealistic speeds (GPS jumps)
  if (speed > maxSpeed) {
    return { accept: false, distance: 0, speed: 0 };
  }

  return { accept: true, distance, speed };
}

/**
 * Calculate elevation changes from a path
 */
export function calculateElevation(path: GeoPoint[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    
    if (prev.altitude !== undefined && curr.altitude !== undefined) {
      const diff = curr.altitude - prev.altitude;
      // Use a threshold to filter out noise (1m)
      if (diff > 1) {
        gain += diff;
      } else if (diff < -1) {
        loss += Math.abs(diff);
      }
    }
  }
  
  return { gain, loss };
}

/**
 * Calculate comprehensive run statistics from a path
 */
export function calculateRunStats(
  path: GeoPoint[],
  weightKg: number
): RunStats {
  if (path.length < 2) {
    return {
      distance: 0,
      duration: 0,
      calories: 0,
      avgPace: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      elevationGain: 0,
      elevationLoss: 0,
    };
  }

  let totalDistance = 0;
  let maxSpeed = 0;
  const speeds: number[] = [];

  // Calculate distance and speeds
  for (let i = 1; i < path.length; i++) {
    const dist = haversineDistance(path[i - 1], path[i]);
    const speed = calculateSpeed(path[i - 1], path[i]);
    
    totalDistance += dist;
    if (speed > 0 && speed < 45) { // Filter unrealistic values
      speeds.push(speed);
      if (speed > maxSpeed) maxSpeed = speed;
    }
  }

  // Calculate duration
  const duration = (path[path.length - 1].t - path[0].t) / 1000;

  // Calculate elevation
  const { gain: elevationGain, loss: elevationLoss } = calculateElevation(path);

  // Calculate averages
  const avgSpeed = duration > 0 ? (totalDistance / 1000) / (duration / 3600) : 0;
  const avgPace = avgSpeed > 0 ? 3600 / avgSpeed : 0;

  // Calculate calories
  const calories = calculateRunningCalories(weightKg, duration, totalDistance, elevationGain);

  return {
    distance: totalDistance,
    duration,
    calories,
    avgPace,
    avgSpeed,
    maxSpeed,
    elevationGain,
    elevationLoss,
  };
}

/**
 * Format time in HH:MM:SS or MM:SS format
 */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  return h > 0 
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Format pace in M:SS /km format
 */
export function formatPace(secondsPerKm: number): string {
  if (!isFinite(secondsPerKm) || secondsPerKm <= 0) return '--:--';
  
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.floor(secondsPerKm % 60);
  
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format distance in km with appropriate precision
 */
export function formatDistance(meters: number): string {
  const km = meters / 1000;
  return km < 10 ? km.toFixed(2) : km.toFixed(1);
}

/**
 * Request wake lock to keep screen on during tracking
 */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if ('wakeLock' in navigator) {
    try {
      const wakeLock = await navigator.wakeLock.request('screen');
      console.log('[MultiFit] Wake lock acquired');
      return wakeLock;
    } catch (err) {
      console.log('[MultiFit] Wake lock failed:', err);
    }
  }
  return null;
}

/**
 * Release wake lock
 */
export async function releaseWakeLock(wakeLock: WakeLockSentinel | null): Promise<void> {
  if (wakeLock) {
    await wakeLock.release();
    console.log('[MultiFit] Wake lock released');
  }
}
