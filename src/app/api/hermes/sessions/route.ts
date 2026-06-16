import { NextResponse } from 'next/server';

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642';
const HERMES_API_KEY = process.env.HERMES_API_KEY || 'hermes-local';

export async function GET() {
  try {
    const res = await fetch(`${HERMES_API_URL}/api/sessions`, {
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
      sessions: [
        {
          id: 'demo-1',
          title: 'Phân tích kiến trúc hệ thống',
          created_at: new Date(Date.now() - 86400000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
          message_count: 12,
          status: 'completed',
        },
        {
          id: 'demo-2',
          title: 'Viết tài liệu API',
          created_at: new Date(Date.now() - 172800000).toISOString(),
          updated_at: new Date(Date.now() - 86400000).toISOString(),
          message_count: 8,
          status: 'completed',
        },
        {
          id: 'demo-3',
          title: 'Debug lỗi kết nối database',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          message_count: 3,
          status: 'active',
        },
      ],
    });
  }
}
