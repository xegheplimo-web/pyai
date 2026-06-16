import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const qwen = createOpenAI({
  baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY || '',
});

export const maxDuration = 60;

interface SearchResult {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date?: string;
}

export async function POST(req: Request) {
  try {
    const { query, searchDepth = 'standard' } = await req.json();

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Step 1: Web search using z-ai-web-dev-sdk
    const zai = await ZAI.create();
    const searchResults: SearchResult[] = await zai.functions.invoke('web_search', {
      query: query,
      num: 10,
    });

    if (!searchResults || searchResults.length === 0) {
      return NextResponse.json({
        answer: 'Không tìm thấy kết quả cho truy vấn này.',
        sources: [],
        query,
      });
    }

    // Step 2: Read top pages sequentially to avoid rate limiting
    const topResults = searchResults.slice(0, 5);
    const pageContents: { url: string; name: string; content: string }[] = [];

    // Process 2 at a time with delay to avoid 429 rate limiting
    for (let i = 0; i < topResults.length; i += 2) {
      const batch = topResults.slice(i, i + 2);
      const batchResults = await Promise.all(
        batch.map(async (result) => {
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
              return {
                url: result.url,
                name: result.name || result.host_name,
                content: plainText,
              };
            }
          } catch {
            // Skip pages that fail to read
          }
          return null;
        })
      );
      pageContents.push(...batchResults.filter(Boolean) as { url: string; name: string; content: string }[]);
      // Small delay between batches
      if (i + 2 < topResults.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Step 3: AI synthesis using Qwen 3.5 Flash
    const sourcesText = pageContents
      .map((p, i) => `[Source ${i + 1}: ${p.name}](${p.url})\n${p.content}`)
      .join('\n\n---\n\n');

    const synthesisPrompt = `Bạn là trợ lý tìm kiếm thông minh giống Perplexity AI. Dựa trên các nguồn thông tin dưới đây, hãy trả lời câu hỏi của người dùng một cách chi tiết, chính xác và có trích dẫn nguồn.

QUY TẮC:
1. Trả lời bằng tiếng Việt nếu câu hỏi bằng tiếng Việt
2. Trích dẫn nguồn bằng format [Source X] khi sử dụng thông tin từ nguồn đó
3. Cấu trúc trả lời rõ ràng với heading, bullet points
4. Nếu thông tin không đủ, hãy nói rõ
5. Bao gồm thông tin cụ thể như địa chỉ, số điện thoại, giờ mở cửa nếu có

CÂU HỎI: ${query}

NGUỒN THÔNG TIN:
${sourcesText}

Hãy tổng hợp thông tin và trả lời:`;

    const { text: answer } = await generateText({
      model: qwen('qwen3.5-flash'),
      prompt: synthesisPrompt,
      maxTokens: 2000,
    });

    return NextResponse.json({
      answer,
      sources: searchResults.map((r, i) => ({
        id: i + 1,
        url: r.url,
        name: r.name || r.host_name,
        snippet: r.snippet,
        host_name: r.host_name,
        date: r.date,
      })),
      query,
      pageContents: pageContents.map((p, i) => ({
        url: p.url,
        name: p.name,
        contentLength: p.content.length,
      })),
    });
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Lỗi tìm kiếm', message: error.message },
      { status: 500 }
    );
  }
}
