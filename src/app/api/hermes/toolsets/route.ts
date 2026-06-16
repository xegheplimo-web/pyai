import { NextResponse } from 'next/server';

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642';
const HERMES_API_KEY = process.env.HERMES_API_KEY || 'hermes-local';

export async function GET() {
  try {
    const res = await fetch(`${HERMES_API_URL}/v1/toolsets`, {
      headers: {
        'Authorization': `Bearer ${HERMES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      toolsets: [
        {
          name: 'hermes-cli',
          description: 'Bộ công cụ CLI cơ bản của Hermes Agent',
          tools: ['read_file', 'write_file', 'search_files', 'terminal', 'process'],
        },
        {
          name: 'web-tools',
          description: 'Công cụ duyệt và tìm kiếm web',
          tools: ['web_search', 'web_extract', 'browser_navigate', 'browser_screenshot', 'browser_click'],
        },
        {
          name: 'media-tools',
          description: 'Công cụ xử lý media (ảnh, âm thanh)',
          tools: ['image_generate', 'text_to_speech', 'vision_analyze'],
        },
        {
          name: 'mcp-servers',
          description: 'Các MCP server được cấu hình',
          tools: [],
        },
      ],
    });
  }
}
