import { NextRequest, NextResponse } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Qwen provider for AI synthesis
const qwen = createOpenAI({
  baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY || '',
});

interface SearchSource {
  id: number;
  url: string;
  name: string;
  snippet: string;
  host_name?: string;
  date?: string;
}

interface SearchPlace {
  id: number | string;
  name: string;
  fullAddress: string;
  lat: number;
  lon: number;
  type?: string;
  category?: string;
  phone?: string | null;
  website?: string | null;
  openingHours?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const { query, location } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json(
        { error: 'Thiếu từ khóa tìm kiếm', answer: '', sources: [], places: [] },
        { status: 400 }
      );
    }

    console.log(`[Business API] Searching for: "${query}" in "${location || 'Việt Nam'}"`);

    // Step 1: Search the web for business information
    const webSources = await searchWeb(query, location);
    console.log(`[Business API] Found ${webSources.length} web sources`);

    // Step 2: Search for places on the map (Nominatim + Overpass)
    const places = await searchBusinessPlaces(query, location);
    console.log(`[Business API] Found ${places.length} places`);

    // Step 3: Read top web pages for detailed information
    const pageContents = await readWebPages(webSources.slice(0, 4));
    console.log(`[Business API] Read ${pageContents.length} pages`);

    // Step 4: Use AI to synthesize a comprehensive answer
    const answer = await synthesizeBusinessAnswer(query, location, webSources, places, pageContents);

    return NextResponse.json({
      answer,
      sources: webSources,
      places,
      query,
    });
  } catch (error: any) {
    console.error('[Business API] Error:', error);
    return NextResponse.json(
      {
        error: 'Lỗi tìm kiếm doanh nghiệp',
        message: error.message,
        answer: 'Không thể tìm kiếm thông tin doanh nghiệp lúc này. Vui lòng thử lại sau.',
        sources: [],
        places: [],
      },
      { status: 500 }
    );
  }
}

// Web search using z-ai-web-dev-sdk via Node.js
async function searchWeb(query: string, location?: string): Promise<SearchSource[]> {
  try {
    const searchQuery = location ? `${query} ${location}` : query;

    // Use z-ai-web-dev-sdk web search
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();

    const searchResult = await zai.functions.invoke('web_search', {
      query: searchQuery,
      num: 10,
    });

    if (Array.isArray(searchResult)) {
      return searchResult.map((item: any, idx: number) => ({
        id: idx + 1,
        url: item.url || '',
        name: item.name || '',
        snippet: item.snippet || '',
        host_name: item.host_name || '',
        date: item.date || '',
      }));
    }

    return [];
  } catch (error: any) {
    console.error('[Business API] Web search error:', error.message);

    // Fallback: try DuckDuckGo HTML search
    try {
      return await searchDuckDuckGo(query, location);
    } catch {
      return [];
    }
  }
}

// Fallback web search via DuckDuckGo
async function searchDuckDuckGo(query: string, location?: string): Promise<SearchSource[]> {
  const searchQuery = encodeURIComponent(location ? `${query} ${location}` : query);
  const url = `https://html.duckduckgo.com/html/?q=${searchQuery}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(10000),
  });

  const html = await response.text();
  const sources: SearchSource[] = [];

  // Parse DuckDuckGo HTML results
  const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)">(.*?)<\/a>.*?<a class="result__snippet".*?>(.*?)<\/a>/gs;
  let match;
  let idx = 0;

  while ((match = resultRegex.exec(html)) !== null && idx < 8) {
    const resultUrl = match[1];
    const name = match[2].replace(/<[^>]*>/g, '').trim();
    const snippet = match[3].replace(/<[^>]*>/g, '').trim();

    if (resultUrl && name) {
      try {
        const parsed = new URL(resultUrl);
        sources.push({
          id: idx + 1,
          url: resultUrl,
          name,
          snippet,
          host_name: parsed.hostname,
        });
        idx++;
      } catch {}
    }
  }

  return sources;
}

// Search business places using Nominatim + Overpass
async function searchBusinessPlaces(query: string, location?: string): Promise<SearchPlace[]> {
  const places: SearchPlace[] = [];

  // Try Nominatim first with viewbox for better location results
  try {
    const searchQuery = location ? `${query} ${location}` : `${query} Việt Nam`;
    const params = new URLSearchParams({
      q: searchQuery,
      format: 'json',
      addressdetails: '1',
      extratags: '1',
      limit: '15',
      'accept-language': 'vi,en',
      countrycodes: 'vn',
    });

    // Add viewbox for major cities to improve relevance
    const cityViewboxes: Record<string, string> = {
      'hcm': '106.4,10.4,107.0,11.0',
      'ho chi minh': '106.4,10.4,107.0,11.0',
      'sai gon': '106.4,10.4,107.0,11.0',
      'quan 1': '106.68,10.75,106.72,10.79',
      'hà nội': '105.6,20.8,106.0,21.2',
      'hanoi': '105.6,20.8,106.0,21.2',
      'đà nẵng': '108.1,15.9,108.3,16.2',
      'da nang': '108.1,15.9,108.3,16.2',
    };

    const locLower = (location || '').toLowerCase();
    for (const [city, viewbox] of Object.entries(cityViewboxes)) {
      if (locLower.includes(city)) {
        params.set('viewbox', viewbox);
        params.set('bounded', '1');
        break;
      }
    }

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'HermesSmartSearch/1.0',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const results = await response.json();
      for (const r of results) {
        places.push({
          id: r.place_id || places.length,
          name: r.name || r.display_name?.split(',')[0] || '',
          fullAddress: r.display_name || '',
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          type: r.type || '',
          category: r.category || '',
          phone: r.extratags?.phone || null,
          website: r.extratags?.website || null,
          openingHours: r.extratags?.opening_hours || null,
        });
      }
    }
  } catch (error: any) {
    console.error('[Business API] Nominatim error:', error.message);
  }

  // Try Overpass API for more detailed POI data
  try {
    const overpassPlaces = await searchBusinessOverpass(query, location);
    // Merge, avoiding duplicates by proximity
    for (const op of overpassPlaces) {
      const isDuplicate = places.some(
        p => Math.abs(p.lat - op.lat) < 0.001 && Math.abs(p.lon - op.lon) < 0.001
      );
      if (!isDuplicate) {
        places.push(op);
      }
    }
  } catch (error: any) {
    console.error('[Business API] Overpass error:', error.message);
  }

  return places.filter(p => !isNaN(p.lat) && !isNaN(p.lon) && p.lat !== 0);
}

// Overpass API for business POI search
async function searchBusinessOverpass(query: string, location?: string): Promise<SearchPlace[]> {
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

  // Vietnam bbox
  const bbox = '8.0,102.0,24.0,110.0';
  // Narrower bbox for specific cities
  const cityBboxes: Record<string, string> = {
    'hcm': '10.4,106.4,11.0,107.0',
    'ho chi minh': '10.4,106.4,11.0,107.0',
    'hà nội': '20.8,105.6,21.2,106.0',
    'hanoi': '20.8,105.6,21.2,106.0',
    'đà nẵng': '15.9,108.1,16.2,108.3',
    'da nang': '15.9,108.1,16.2,108.3',
  };

  let usedBbox = bbox;
  const locLower = (location || '').toLowerCase();
  for (const [city, cityBbox] of Object.entries(cityBboxes)) {
    if (locLower.includes(city)) {
      usedBbox = cityBbox;
      break;
    }
  }

  const overpassQuery = `
    [out:json][timeout:20];
    (
      node["name"~"${query}",i](${usedBbox});
      way["name"~"${query}",i](${usedBbox});
      node["shop"]["name"~"${query}",i](${usedBbox});
      node["amenity"~"restaurant|cafe|bank|pharmacy|hospital|clinic|office"]["name"~"${query}",i](${usedBbox});
      way["shop"]["name"~"${query}",i](${usedBbox});
      way["amenity"~"restaurant|cafe|bank|pharmacy|hospital|clinic|office"]["name"~"${query}",i](${usedBbox});
    );
    out center body 20;
  `;

  const response = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(overpassQuery)}`, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'HermesSmartSearch/1.0' },
  });

  if (!response.ok) return [];

  const data = await response.json();

  return (data.elements || [])
    .filter((el: any) => el.lat || el.center?.lat)
    .map((el: any, idx: number) => ({
      id: `osm-${el.id || idx}`,
      name: el.tags?.name || query,
      fullAddress: [
        el.tags?.['addr:housenumber'],
        el.tags?.['addr:street'],
        el.tags?.['addr:city'] || el.tags?.['addr:state'],
        'Việt Nam',
      ].filter(Boolean).join(', ') || 'Việt Nam',
      lat: el.lat || el.center?.lat || 0,
      lon: el.lon || el.center?.lon || 0,
      type: el.tags?.shop || el.tags?.amenity || el.tags?.office || el.tags?.tourism || '',
      category: el.tags?.shop ? 'shop' : el.tags?.amenity ? 'amenity' : el.tags?.office ? 'office' : 'place',
      phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
      website: el.tags?.website || el.tags?.['contact:website'] || null,
      openingHours: el.tags?.opening_hours || null,
    }))
    .filter((p: any) => p.lat !== 0);
}

// Read web pages for detailed content
async function readWebPages(sources: SearchSource[]): Promise<string[]> {
  const contents: string[] = [];

  for (const source of sources.slice(0, 3)) {
    try {
      const { default: ZAI } = await import('z-ai-web-dev-sdk');
      const zai = await ZAI.create();

      const result = await zai.functions.invoke('web_reader', {
        url: source.url,
      });

      if (result?.html || result?.content) {
        const content = result.content || result.html;
        // Truncate to avoid token overflow
        contents.push(
          `Source: ${source.name} (${source.url})\n${typeof content === 'string' ? content.slice(0, 3000) : JSON.stringify(content).slice(0, 3000)}`
        );
      }
    } catch {
      // Skip failed reads
    }
  }

  return contents;
}

// AI synthesis for business search results
async function synthesizeBusinessAnswer(
  query: string,
  location: string | undefined,
  sources: SearchSource[],
  places: SearchPlace[],
  pageContents: string[]
): Promise<string> {
  try {
    const sourcesContext = sources
      .slice(0, 8)
      .map(s => `[${s.id}] ${s.name}: ${s.snippet}`)
      .join('\n');

    const placesContext = places
      .slice(0, 10)
      .map(p => {
        let info = `- ${p.name} (${p.type || 'doanh nghiệp'}): ${p.fullAddress}`;
        if (p.phone) info += ` | ĐT: ${p.phone}`;
        if (p.openingHours) info += ` | Giờ mở cửa: ${p.openingHours}`;
        if (p.website) info += ` | Web: ${p.website}`;
        return info;
      })
      .join('\n');

    const pageContext = pageContents.join('\n\n---\n\n');

    const prompt = `Bạn là trợ lý tìm kiếm thông minh chuyên về thông tin doanh nghiệp tại Việt Nam. 
Dựa trên các nguồn thông tin dưới đây, hãy cung cấp câu trả lời chi tiết, có cấu trúc cho câu hỏi của người dùng.

Câu hỏi: "${query}" ${location ? `tại ${location}` : ''}

Nguồn tìm kiếm web:
${sourcesContext || 'Không có nguồn web'}

Địa điểm tìm thấy trên bản đồ:
${placesContext || 'Không tìm thấy địa điểm'}

Nội dung trang web chi tiết:
${pageContext || 'Không đọc được nội dung chi tiết'}

Yêu cầu:
1. Cung cấp thông tin chi tiết, có cấu trúc (sử dụng bullet points)
2. Nếu có địa điểm, liệt kê rõ tên, địa chỉ, số điện thoại, giờ mở cửa
3. Nếu có thông tin về giấy phép kinh doanh, hãy đề cập
4. Thêm thông tin hữu ích liên quan (quy định, thủ tục, v.v.)
5. Trả lời bằng tiếng Việt
6. Nếu thông tin không đầy đủ, hãy đề xuất cách tìm kiếm thêm`;

    const result = await generateText({
      model: qwen('qwen3.5-flash'),
      prompt,
      maxTokens: 2048,
    });

    return result.text || 'Không thể tổng hợp thông tin. Vui lòng xem các nguồn tham khảo bên dưới.';
  } catch (error: any) {
    console.error('[Business API] AI synthesis error:', error.message);

    // Fallback: construct a basic answer from available data
    if (places.length > 0) {
      const placeList = places.slice(0, 5).map(p =>
        `- ${p.name}: ${p.fullAddress}${p.phone ? ` | ĐT: ${p.phone}` : ''}${p.openingHours ? ` | Giờ: ${p.openingHours}` : ''}`
      ).join('\n');
      return `Tìm thấy ${places.length} địa điểm cho "${query}":\n\n${placeList}`;
    }

    if (sources.length > 0) {
      const sourceList = sources.slice(0, 5).map(s =>
        `- [${s.id}] ${s.name}: ${s.snippet}`
      ).join('\n');
      return `Kết quả tìm kiếm cho "${query}":\n\n${sourceList}`;
    }

    return 'Không tìm thấy thông tin doanh nghiệp phù hợp.';
  }
}
