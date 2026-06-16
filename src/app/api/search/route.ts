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

    console.log(`[Smart Search] Searching for: "${query}"`);

    // Step 1: Detect query intent (is it location-related?)
    const isLocationQuery = detectLocationIntent(query);

    // Step 2: Parallel search - web + places (if location-related)
    const [webSources, places] = await Promise.all([
      searchWeb(query),
      isLocationQuery ? searchPlaces(query, location) : Promise.resolve([]),
    ]);

    console.log(`[Smart Search] Web: ${webSources.length} sources, Places: ${places.length}`);

    // Step 3: Read top web pages for detailed content
    const pageContents = await readWebPages(webSources.slice(0, 4));
    console.log(`[Smart Search] Read ${pageContents.length} pages`);

    // Step 4: AI synthesis
    const answer = await synthesizeAnswer(query, webSources, places, pageContents);

    return NextResponse.json({
      answer,
      sources: webSources,
      places,
      query,
    });
  } catch (error: any) {
    console.error('[Smart Search] Error:', error);
    return NextResponse.json(
      {
        error: 'Lỗi tìm kiếm',
        message: error.message,
        answer: 'Không thể tìm kiếm lúc này. Vui lòng thử lại sau.',
        sources: [],
        places: [],
      },
      { status: 500 }
    );
  }
}

// Detect if the query is location/place related
function detectLocationIntent(query: string): boolean {
  const locationKeywords = [
    'ở đâu', 'tại', 'địa chỉ', 'vị trí', 'cửa hàng', 'nhà hàng', 'quán',
    'phòng khám', 'bệnh viện', 'trường', 'chợ', 'siêu thị', 'ngân hàng',
    'công ty', 'văn phòng', 'địa điểm', 'bản đồ', 'gần', 'quận', 'phường',
    'thành phố', 'tỉnh', 'đường', 'store', 'shop', 'restaurant', 'cafe',
    'hospital', 'clinic', 'bank', 'school', 'market', 'near', 'location',
    'map', 'address', 'where', 'place',
  ];

  const queryLower = query.toLowerCase();
  return locationKeywords.some(kw => queryLower.includes(kw));
}

// Web search using z-ai-web-dev-sdk
async function searchWeb(query: string): Promise<SearchSource[]> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();

    const searchResult = await zai.functions.invoke('web_search', {
      query,
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
    console.error('[Smart Search] z-ai web search error:', error.message);

    // Fallback to DuckDuckGo
    try {
      return await searchDuckDuckGo(query);
    } catch {
      return [];
    }
  }
}

// Fallback: DuckDuckGo HTML search
async function searchDuckDuckGo(query: string): Promise<SearchSource[]> {
  const searchQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${searchQuery}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(10000),
  });

  const html = await response.text();
  const sources: SearchSource[] = [];

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

// Search places using Nominatim (OpenStreetMap)
async function searchPlaces(query: string, location?: string): Promise<SearchPlace[]> {
  try {
    const searchQuery = location ? `${query} ${location}` : `${query} Việt Nam`;
    const params = new URLSearchParams({
      q: searchQuery,
      format: 'json',
      addressdetails: '1',
      extratags: '1',
      limit: '10',
      'accept-language': 'vi,en',
      countrycodes: 'vn',
    });

    // Add viewbox for major cities
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

    const locLower = (location || '').toLowerCase() + ' ' + query.toLowerCase();
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

    if (!response.ok) return [];

    const results = await response.json();

    return results
      .map((r: any, idx: number) => ({
        id: r.place_id || idx,
        name: r.name || r.display_name?.split(',')[0] || '',
        fullAddress: r.display_name || '',
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        type: r.type || '',
        category: r.category || '',
        phone: r.extratags?.phone || null,
        website: r.extratags?.website || null,
        openingHours: r.extratags?.opening_hours || null,
      }))
      .filter((p: SearchPlace) => !isNaN(p.lat) && !isNaN(p.lon) && p.lat !== 0);
  } catch (error: any) {
    console.error('[Smart Search] Places error:', error.message);
    return [];
  }
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

// AI synthesis using Qwen 3.5 Flash
async function synthesizeAnswer(
  query: string,
  sources: SearchSource[],
  places: SearchPlace[],
  pageContents: string[]
): Promise<string> {
  try {
    const sourcesContext = sources
      .slice(0, 8)
      .map(s => `[${s.id}] ${s.name}: ${s.snippet}`)
      .join('\n');

    const placesContext = places.length > 0
      ? places.slice(0, 8).map(p => {
          let info = `- ${p.name} (${p.type || 'địa điểm'}): ${p.fullAddress}`;
          if (p.phone) info += ` | ĐT: ${p.phone}`;
          if (p.openingHours) info += ` | Giờ: ${p.openingHours}`;
          return info;
        }).join('\n')
      : '';

    const pageContext = pageContents.join('\n\n---\n\n');

    const prompt = `Bạn là trợ lý tìm kiếm thông minh kiểu Perplexity AI. Hãy tổng hợp thông tin từ nhiều nguồn để trả lời câu hỏi một cách chi tiết, chính xác và có trích dẫn nguồn.

Câu hỏi: "${query}"

Kết quả tìm kiếm web:
${sourcesContext || 'Không có nguồn web'}

${placesContext ? `Địa điểm trên bản đồ:\n${placesContext}` : ''}

${pageContext ? `Nội dung chi tiết từ trang web:\n${pageContext}` : ''}

Yêu cầu:
1. Trả lời chi tiết, có cấu trúc rõ ràng (sử dụng bullet points, đánh số)
2. Trích dẫn nguồn bằng số [1], [2], ... tương ứng với nguồn tìm kiếm
3. Nếu có thông tin địa điểm, liệt kê rõ tên, địa chỉ, liên hệ
4. Thêm thông tin bổ sung hữu ích nếu có
5. Trả lời bằng tiếng Việt
6. Nếu thông tin không đủ, đề xuất cách tìm thêm`;

    const result = await generateText({
      model: qwen('qwen3.5-flash'),
      prompt,
      maxTokens: 2048,
    });

    return result.text || 'Không thể tổng hợp thông tin. Vui lòng xem các nguồn tham khảo.';
  } catch (error: any) {
    console.error('[Smart Search] AI synthesis error:', error.message);

    // Fallback: basic answer from sources
    if (sources.length > 0) {
      return sources.slice(0, 6).map(s =>
        `[${s.id}] **${s.name}**: ${s.snippet}`
      ).join('\n\n');
    }

    return 'Không tìm thấy kết quả phù hợp.';
  }
}
