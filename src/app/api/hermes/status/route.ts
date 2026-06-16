import { NextResponse } from 'next/server';

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642';
const HERMES_API_KEY = process.env.HERMES_API_KEY || 'hermes-local';

async function hermesFetch(path: string, options?: RequestInit) {
  try {
    const res = await fetch(`${HERMES_API_URL}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${HERMES_API_KEY}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: AbortSignal.timeout(5000),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const [health, models, capabilities, skills, sessions] = await Promise.all([
    hermesFetch('/health/detailed'),
    hermesFetch('/v1/models'),
    hermesFetch('/v1/capabilities'),
    hermesFetch('/v1/skills'),
    hermesFetch('/api/sessions'),
  ]);

  return NextResponse.json({
    connected: health !== null,
    health,
    models,
    capabilities,
    skills,
    sessions,
    apiBaseUrl: HERMES_API_URL,
  });
}
