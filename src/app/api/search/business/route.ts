import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const qwen = createOpenAI({
  baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY || '',
});

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export async function POST(req: Request) {
  try {
    const { query, location, businessType } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Step 1: Search for places using Nominatim
    const searchQuery = location ? `${query} ${location}` : query;
    let places: any[] = [];
    
    try {
      const nomRes = await fetch(
        `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=10&addressdetails=1&extratags=1&namedetails=1&accept-language=vi`,
        {
          headers: { 'User-Agent': 'HermesSearchDashboard/1.0' },
          signal: AbortSignal.timeout(10000),
        }
      );
      places = await nomRes.json();
    } catch {
      // Nominatim might fail
    }

    // Step 2: Web search for business registration info
    const zai = await ZAI.create();
    const webResults = await zai.functions.invoke('web_search', {
      query: `${query} giấy phép kinh doanh địa chỉ ${location || ''}`,
      num: 8,
    });

    // Step 3: Read top business info pages
    const pageContents: { url: string; name: string; content: string }[] = [];
    if (webResults?.length) {
      await Promise.all(
        webResults.slice(0, 4).map(async (result: any) => {
          try {
            const pageData = await zai.functions.invoke('web_reader', {
              url: result.url,
            });
            if (pageData?.html) {
              const plainText = pageData.html
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 3000);
              pageContents.push({
                url: result.url,
                name: result.name || result.host_name,
                content: plainText,
              });
            }
          } catch {}
        })
      );
    }

    // Step 4: AI synthesis for business information
    const placesInfo = places
      .map((p, i) => `[Địa điểm ${i + 1}]: ${p.display_name} (Lat: ${p.lat}, Lon: ${p.lon})${p.extratags?.phone ? `, ĐT: ${p.extratags.phone}` : ''}${p.extratags?.opening_hours ? `, Giờ mở cửa: ${p.extratags.opening_hours}` : ''}`)
      .join('\n');

    const webInfo = pageContents
      .map((p, i) => `[Nguồn web ${i + 1}: ${p.name}](${p.url})\n${p.content}`)
      .join('\n\n---\n\n');

    const synthesisPrompt = `Bạn là trợ lý tìm kiếm thông tin doanh nghiệp chuyên nghiệp. Hãy tổng hợp thông tin về doanh nghiệp/cửa hàng được yêu cầu.

QUY TẮC:
1. Trả lời bằng tiếng Việt
2. Bao gồm: Tên doanh nghiệp, Địa chỉ, Số điện thoại, Giờ mở cửa, Loại hình kinh doanh, Mã số thuế/Giấy phép kinh doanh (nếu có)
3. Trích dẫn nguồn [Địa điểm X] hoặc [Nguồn web X]
4. Nếu tìm thấy nhiều doanh nghiệp, liệt kê tất cả
5. Nhấn mạnh thông tin về giấy phép kinh doanh và tình trạng pháp lý nếu có

CÂU HỎI: ${query}${location ? ` tại ${location}` : ''}${businessType ? ` - Loại: ${businessType}` : ''}

THÔNG TIN ĐỊA ĐIỂM (OpenStreetMap):
${placesInfo || 'Không tìm thấy địa điểm trên bản đồ'}

THÔNG TIN WEB:
${webInfo || 'Không tìm thấy thông tin bổ sung'}

Hãy tổng hợp:`;

    const { text: answer } = await generateText({
      model: qwen('qwen3.5-flash'),
      prompt: synthesisPrompt,
      maxTokens: 2500,
    });

    return NextResponse.json({
      answer,
      places: places.map((p, i) => ({
        id: i + 1,
        name: p.display_name.split(',')[0],
        fullAddress: p.display_name,
        lat: parseFloat(p.lat),
        lon: parseFloat(p.lon),
        type: p.type,
        category: p.class,
        phone: p.extratags?.phone || p.extratags?.['contact:phone'] || null,
        website: p.extratags?.website || p.extratags?.['contact:website'] || null,
        openingHours: p.extratags?.opening_hours || null,
      })),
      sources: (webResults || []).map((r: any, i: number) => ({
        id: i + 1,
        url: r.url,
        name: r.name || r.host_name,
        snippet: r.snippet,
      })),
      query,
    });
  } catch (error: any) {
    console.error('Business search error:', error);
    return NextResponse.json(
      { error: 'Lỗi tìm kiếm doanh nghiệp', message: error.message },
      { status: 500 }
    );
  }
}
