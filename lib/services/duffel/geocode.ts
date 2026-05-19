// Shared geocoding utility for Duffel adapters (Stays, Cars).
// Falls back to null when GOOGLE_MAPS_API_KEY is absent — callers must handle.
export async function geocodeDestination(destination: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${key}`
    )
    const geo = await res.json()
    return geo.results?.[0]?.geometry?.location ?? null
  } catch { return null }
}
