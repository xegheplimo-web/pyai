import { NextResponse } from 'next/server';

// Nominatim (OpenStreetMap) - Free geocoding & POI search, no API key needed
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

interface PlaceResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  importance: number;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    suburb?: string;
  };
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const radius = searchParams.get('radius') || '5000'; // meters
    const limit = searchParams.get('limit') || '20';

    if (!query) {
      return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
    }

    let results: PlaceResult[] = [];

    if (lat && lon) {
      // Search with bounded view for area-specific search
      const delta = parseFloat(radius) / 111000; // rough km to degree conversion
      const bbox = [
        parseFloat(lon) - delta,
        parseFloat(lat) - delta,
        parseFloat(lon) + delta,
        parseFloat(lat) + delta,
      ];

      const res = await fetch(
        `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(query)}&viewbox=${bbox.join(',')}&bounded=0&limit=${limit}&addressdetails=1&extratags=1&namedetails=1&accept-language=vi`,
        {
          headers: {
            'User-Agent': 'HermesSearchDashboard/1.0',
          },
          signal: AbortSignal.timeout(10000),
        }
      );
      results = await res.json();
    } else {
      // General search
      const res = await fetch(
        `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(query)}&limit=${limit}&addressdetails=1&extratags=1&namedetails=1&accept-language=vi&countrycodes=vn`,
        {
          headers: {
            'User-Agent': 'HermesSearchDashboard/1.0',
          },
          signal: AbortSignal.timeout(10000),
        }
      );
      results = await res.json();
    }

    // Also try Overpass API for POI search (shops, restaurants, businesses)
    let overpassResults: any[] = [];
    try {
      if (lat && lon) {
        const overpassQuery = `
          [out:json][timeout:10];
          (
            node["name"~"${query}",i](around:${radius},${lat},${lon});
            node["shop"~".*",i](around:${radius},${lat},${lon});
            node["amenity"~".*",i](around:${radius},${lat},${lon});
            node["office"~".*",i](around:${radius},${lat},${lon});
          );
          out body 10;
        `;
        const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: `data=${encodeURIComponent(overpassQuery)}`,
          signal: AbortSignal.timeout(15000),
        });
        const overpassData = await overpassRes.json();
        overpassResults = (overpassData.elements || []).filter(
          (el: any) => el.tags?.name?.toLowerCase().includes(query.toLowerCase())
        );
      }
    } catch {
      // Overpass might timeout, that's ok
    }

    // Combine and format results
    const formattedResults = [
      ...results.map((r) => ({
        id: r.place_id,
        name: r.display_name.split(',')[0],
        fullAddress: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        type: r.type,
        category: r.class,
        importance: r.importance,
        address: r.address,
        tags: r.extratags || {},
        phone: r.extratags?.phone || r.extratags?.['contact:phone'] || null,
        website: r.extratags?.website || r.extratags?.['contact:website'] || null,
        openingHours: r.extratags?.opening_hours || null,
        source: 'nominatim',
      })),
      ...overpassResults.map((el: any) => ({
        id: `overpass-${el.id}`,
        name: el.tags?.name || 'Không tên',
        fullAddress: `${el.tags?.['addr:street'] || ''} ${el.tags?.['addr:housenumber'] || ''}, ${el.tags?.['addr:city'] || ''}`.trim().replace(/^,|,$/g, ''),
        lat: el.lat,
        lon: el.lon,
        type: el.tags?.shop || el.tags?.amenity || el.tags?.office || 'place',
        category: el.tags?.shop ? 'shop' : el.tags?.amenity ? 'amenity' : el.tags?.office ? 'office' : 'place',
        importance: 0.5,
        address: {
          road: el.tags?.['addr:street'],
          house_number: el.tags?.['addr:housenumber'],
          city: el.tags?.['addr:city'],
          postcode: el.tags?.['addr:postcode'],
        },
        tags: el.tags || {},
        phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
        website: el.tags?.website || el.tags?.['contact:website'] || null,
        openingHours: el.tags?.opening_hours || null,
        source: 'overpass',
      })),
    ];

    return NextResponse.json({
      places: formattedResults,
      query,
      count: formattedResults.length,
    });
  } catch (error: any) {
    console.error('Places search error:', error);
    return NextResponse.json(
      { error: 'Lỗi tìm kiếm địa điểm', message: error.message, places: [] },
      { status: 500 }
    );
  }
}
