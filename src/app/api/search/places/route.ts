import { NextRequest, NextResponse } from 'next/server';

// Nominatim (OpenStreetMap) free geocoding - no API key needed
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_DETAILS_URL = 'https://nominatim.openstreetmap.org/details';

interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type: string;
  category: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
  bounded?: number;
  icon?: string;
  importance?: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);
    const viewbox = searchParams.get('viewbox'); // "lon1,lat1,lon2,lat2"
    const bounded = searchParams.get('bounded'); // 1 = restrict to viewbox

    if (!query?.trim()) {
      return NextResponse.json(
        { error: 'Thiếu từ khóa tìm kiếm', places: [] },
        { status: 400 }
      );
    }

    // Build Nominatim search params
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      extratags: '1',
      namedetails: '0',
      limit: limit.toString(),
      'accept-language': 'vi,en',
    });

    // Auto-detect city keywords for viewbox if not provided
    if (!viewbox) {
      const cityViewboxes: Record<string, string> = {
        'hcm': '106.4,10.4,107.0,11.0',
        'ho chi minh': '106.4,10.4,107.0,11.0',
        'sai gon': '106.4,10.4,107.0,11.0',
        'quan 1': '106.68,10.75,106.72,10.79',
        'quan 2': '106.72,10.76,106.78,10.80',
        'quan 3': '106.66,10.77,106.70,10.80',
        'hà nội': '105.6,20.8,106.0,21.2',
        'hanoi': '105.6,20.8,106.0,21.2',
        'đà nẵng': '108.1,15.9,108.3,16.2',
        'da nang': '108.1,15.9,108.3,16.2',
      };
      const queryLower = query.toLowerCase();
      for (const [city, vb] of Object.entries(cityViewboxes)) {
        if (queryLower.includes(city)) {
          params.set('viewbox', vb);
          params.set('bounded', '1');
          break;
        }
      }
    } else {
      params.set('viewbox', viewbox);
      if (bounded) params.set('bounded', bounded);
    }

    // Add country codes bias for Vietnam
    if (!params.has('countrycodes')) {
      params.set('countrycodes', 'vn'); // Default to Vietnam, can be overridden
    }

    console.log(`[Places API] Searching Nominatim for: "${query}"`);

    const searchResponse = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: {
        'User-Agent': 'HermesSmartSearch/1.0 (hermes-dashboard)',
        'Accept-Language': 'vi,en',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!searchResponse.ok) {
      throw new Error(`Nominatim returned ${searchResponse.status}`);
    }

    const results: NominatimResult[] = await searchResponse.json();

    // Transform results to our SearchPlace format
    const places = results.map((r, idx) => ({
      id: r.place_id || idx,
      name: r.name || r.display_name?.split(',')[0] || 'Unknown',
      fullAddress: r.display_name || '',
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      type: r.type || '',
      category: r.category || '',
      phone: r.extratags?.phone || r.extratags?.['contact:phone'] || null,
      website: r.extratags?.website || r.extratags?.['contact:website'] || null,
      openingHours: r.extratags?.opening_hours || r.extratags?.['opening_hours'] || null,
    }));

    // Filter out results without valid coordinates
    const validPlaces = places.filter(p => !isNaN(p.lat) && !isNaN(p.lon));

    console.log(`[Places API] Found ${validPlaces.length} places for "${query}"`);

    return NextResponse.json({
      places: validPlaces,
      total: validPlaces.length,
      query,
    });
  } catch (error: any) {
    console.error('[Places API] Error:', error.message);

    // Fallback: try Overpass API for more detailed POI search
    try {
      const { searchParams } = new URL(req.url);
      const query = searchParams.get('q');
      if (!query) throw new Error('No query');

      const overpassPlaces = await searchOverpass(query);
      return NextResponse.json({
        places: overpassPlaces,
        total: overpassPlaces.length,
        query,
      });
    } catch (fallbackError: any) {
      return NextResponse.json(
        {
          error: 'Không thể tìm kiếm địa điểm',
          message: fallbackError.message,
          places: [],
          total: 0,
          query: searchParams?.get('q') || '',
        },
        { status: 500 }
      );
    }
  }
}

// Overpass API fallback for more detailed POI data (shops, restaurants, etc.)
async function searchOverpass(query: string): Promise<any[]> {
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

  // Build Overpass QL query
  const encodedQuery = encodeURIComponent(query);
  const overpassQuery = `
    [out:json][timeout:15];
    (
      node["name"~"${query}",i]({{bbox}});
      way["name"~"${query}",i]({{bbox}});
      node["shop"~"${query}",i]({{bbox}});
      node["amenity"~"${query}",i]({{bbox}});
      node["office"~"${query}",i]({{bbox}});
    );
    out center body 10;
  `;

  // Use a Vietnam bounding box as default
  const vietnamBbox = '8.0,102.0,24.0,110.0';
  const finalQuery = overpassQuery.replace(/\{\{bbox\}\}/g, vietnamBbox);

  const response = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(finalQuery)}`, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': 'HermesSmartSearch/1.0',
    },
  });

  if (!response.ok) throw new Error(`Overpass returned ${response.status}`);

  const data = await response.json();

  return (data.elements || [])
    .filter((el: any) => el.lat || el.center?.lat)
    .map((el: any, idx: number) => ({
      id: el.id || idx,
      name: el.tags?.name || query,
      fullAddress: [
        el.tags?.['addr:street'],
        el.tags?.['addr:city'],
        el.tags?.['addr:state'],
        el.tags?.['addr:country'] || 'Việt Nam',
      ].filter(Boolean).join(', ') || 'Không có địa chỉ chi tiết',
      lat: el.lat || el.center?.lat || 0,
      lon: el.lon || el.center?.lon || 0,
      type: el.tags?.shop || el.tags?.amenity || el.tags?.office || '',
      category: el.tags?.shop ? 'shop' : el.tags?.amenity ? 'amenity' : el.tags?.office ? 'office' : 'place',
      phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
      website: el.tags?.website || el.tags?.['contact:website'] || null,
      openingHours: el.tags?.opening_hours || null,
    }))
    .filter((p: any) => p.lat !== 0 && p.lon !== 0);
}
