import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Hermes Agent OpenAI-compatible API configuration
const hermes = createOpenAI({
  baseURL: process.env.HERMES_API_URL || 'http://127.0.0.1:8642/v1',
  apiKey: process.env.HERMES_API_KEY || 'hermes-local',
});

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages, sessionId } = await req.json();

    const result = streamText({
      model: hermes('hermes-agent'),
      messages,
      headers: {
        ...(sessionId ? { 'X-Hermes-Session-Id': sessionId } : {}),
      },
    });

    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error('Chat API error:', error);
    
    // If Hermes is not running, return a helpful error message
    if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
      return new Response(
        JSON.stringify({
          error: 'Hermes Agent không khả dụng',
          message: 'Không thể kết nối đến Hermes Agent. Vui lòng đảm bảo Hermes Gateway đang chạy trên cổng 8642.',
          hint: 'Chạy: hermes gateway để khởi động Hermes Agent',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Lỗi nội bộ server', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
