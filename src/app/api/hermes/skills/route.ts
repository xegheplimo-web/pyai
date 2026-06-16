import { NextResponse } from 'next/server';

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642';
const HERMES_API_KEY = process.env.HERMES_API_KEY || 'hermes-local';

export async function GET() {
  try {
    const res = await fetch(`${HERMES_API_URL}/v1/skills`, {
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
      skills: [
        { name: 'read_file', description: 'Đọc nội dung file từ hệ thống', category: 'filesystem' },
        { name: 'write_file', description: 'Ghi nội dung vào file', category: 'filesystem' },
        { name: 'search_files', description: 'Tìm kiếm file theo pattern', category: 'filesystem' },
        { name: 'terminal', description: 'Thực thi lệnh terminal/shell', category: 'execution' },
        { name: 'web_search', description: 'Tìm kiếm thông tin trên web', category: 'web' },
        { name: 'web_extract', description: 'Trích xuất nội dung từ URL', category: 'web' },
        { name: 'browser_navigate', description: 'Điều hướng trình duyệt tự động', category: 'browser' },
        { name: 'browser_screenshot', description: 'Chụp màn hình trang web', category: 'browser' },
        { name: 'image_generate', description: 'Tạo hình ảnh từ mô tả text', category: 'media' },
        { name: 'text_to_speech', description: 'Chuyển đổi text thành giọng nói', category: 'media' },
        { name: 'vision_analyze', description: 'Phân tích hình ảnh', category: 'media' },
        { name: 'delegate_task', description: 'Giao việc cho agent phụ', category: 'agent' },
        { name: 'skill_create', description: 'Tạo kỹ năng mới từ kinh nghiệm', category: 'agent' },
        { name: 'skill_execute', description: 'Thực thi kỹ năng đã lưu', category: 'agent' },
      ],
    });
  }
}
