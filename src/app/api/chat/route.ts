import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Model provider configurations
const providers = {
  hermes: createOpenAI({
    baseURL: process.env.HERMES_API_URL || 'http://127.0.0.1:8642/v1',
    apiKey: process.env.HERMES_API_KEY || 'hermes-local',
  }),
  qwen: createOpenAI({
    baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY || '',
  }),
};

// Model definitions
const models: Record<string, { provider: 'hermes' | 'qwen'; modelId: string }> = {
  'hermes-agent': { provider: 'hermes', modelId: 'hermes-agent' },
  'qwen3.5-flash': { provider: 'qwen', modelId: 'qwen3.5-flash' },
};

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages, sessionId, model: requestedModel } = await req.json();

    // Select model based on request, default to qwen3.5-flash
    const modelKey = requestedModel && models[requestedModel] ? requestedModel : 'qwen3.5-flash';
    const modelConfig = models[modelKey];
    const provider = providers[modelConfig.provider];

    const result = streamText({
      model: provider(modelConfig.modelId),
      messages,
      ...(modelConfig.provider === 'hermes' && sessionId
        ? { headers: { 'X-Hermes-Session-Id': sessionId } }
        : {}),
    });

    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error('Chat API error:', error);
    
    // If provider is not reachable, return a helpful error message
    if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
      return new Response(
        JSON.stringify({
          error: 'Model provider không khả dụng',
          message: 'Không thể kết nối đến model provider. Vui lòng kiểm tra cấu hình API.',
          hint: 'Kiểm tra HERMES_API_URL hoặc QWEN_BASE_URL trong .env',
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
